import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { OAuthStore } from './oauth-store.js';

interface OAuthRouterOptions { publicBaseUrl: URL; authPassword: string; store: OAuthStore; now?: () => number }

/** 提供 ChatGPT 远程 MCP 所需的 OAuth 发现、审批、令牌与撤销端点。 */
export function createOAuthRouter(options: OAuthRouterOptions): express.Router {
  const router = express.Router();
  const issuer = trailingSlash(options.publicBaseUrl).href;
  const resource = new URL('/mcp', options.publicBaseUrl).href;
  const failures = new Map<string, { count: number; resetAt: number }>();
  const now = options.now ?? Date.now;
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Pragma', 'no-cache'); next(); });

  const resourceMetadata = { resource, authorization_servers: [issuer], bearer_methods_supported: ['header'], scopes_supported: ['mcp:tools'], resource_name: 'Roblox Studio Built-in MCP' };
  router.get('/.well-known/oauth-protected-resource', (_req, res) => res.json(resourceMetadata));
  router.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => res.json(resourceMetadata));
  router.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({
    issuer, authorization_endpoint: new URL('/authorize', options.publicBaseUrl).href,
    token_endpoint: new URL('/token', options.publicBaseUrl).href,
    registration_endpoint: new URL('/register', options.publicBaseUrl).href,
    revocation_endpoint: new URL('/revoke', options.publicBaseUrl).href,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: ['mcp:tools'],
  }));

  router.post('/register', express.json({ limit: '64kb' }), (req, res) => {
    try { res.status(201).json(options.store.registerClient(req.body)); }
    catch (error) { oauthError(res, 400, 'invalid_client_metadata', error); }
  });

  router.get('/authorize', (req, res) => {
    try {
      if (req.query.response_type !== 'code' || req.query.code_challenge_method !== 'S256') throw new Error('OAuth code flow with PKCE S256 is required');
      const redirectUri = text(req.query.redirect_uri, 'redirect_uri');
      const pending = options.store.beginAuthorization(text(req.query.client_id, 'client_id'), {
        redirectUri, codeChallenge: text(req.query.code_challenge, 'code_challenge'),
        state: typeof req.query.state === 'string' ? req.query.state : undefined,
        scopes: typeof req.query.scope === 'string' ? req.query.scope.split(' ').filter(Boolean) : ['mcp:tools'],
        resource: new URL(text(req.query.resource, 'resource')),
      });
      const callbackOrigin = new URL(redirectUri).origin;
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callbackOrigin}`);
      res.type('html').send(approvalPage(pending.id, pending.csrfToken));
    } catch (error) { oauthError(res, 400, 'invalid_request', error); }
  });

  router.post('/authorize/decision', express.urlencoded({ extended: false, limit: '16kb' }), (req, res) => {
    const address = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = failures.get(address);
    if (existing && existing.resetAt > now() && existing.count >= 5) { res.status(429).send('Too many failed authorization attempts.'); return; }
    try {
      const id = text(req.body.approval_id, 'approval_id');
      const csrf = text(req.body.csrf_token, 'csrf_token');
      const pending = options.store.getPendingAuthorization(id, csrf);
      if (!passwordMatches(text(req.body.password, 'password'), options.authPassword)) {
        failures.set(address, { count: (existing?.count ?? 0) + 1, resetAt: existing?.resetAt ?? now() + 15 * 60_000 });
        res.status(401).send('Authorization failed.'); return;
      }
      failures.delete(address);
      const callback = new URL(pending.redirectUri);
      if (pending.state) callback.searchParams.set('state', pending.state);
      callback.searchParams.set('iss', issuer);
      if (req.body.action === 'approve') callback.searchParams.set('code', options.store.approveAuthorization(id, csrf).code);
      else { options.store.denyAuthorization(id, csrf); callback.searchParams.set('error', 'access_denied'); }
      res.redirect(callback.href);
    } catch (error) { oauthError(res, 400, 'invalid_request', error); }
  });

  router.post('/token', express.urlencoded({ extended: false, limit: '16kb' }), (req, res) => {
    try {
      const resourceUrl = new URL(text(req.body.resource, 'resource'));
      const clientId = text(req.body.client_id, 'client_id');
      if (req.body.grant_type === 'authorization_code') {
        res.json(options.store.exchangeAuthorizationCode({ clientId, code: text(req.body.code, 'code'), codeVerifier: text(req.body.code_verifier, 'code_verifier'), redirectUri: text(req.body.redirect_uri, 'redirect_uri'), resource: resourceUrl })); return;
      }
      if (req.body.grant_type === 'refresh_token') {
        res.json(options.store.exchangeRefreshToken({ clientId, refreshToken: text(req.body.refresh_token, 'refresh_token'), resource: resourceUrl, scopes: typeof req.body.scope === 'string' ? req.body.scope.split(' ') : undefined })); return;
      }
      throw new Error('unsupported grant_type');
    } catch (error) { oauthError(res, 400, 'invalid_grant', error); }
  });
  router.post('/revoke', express.urlencoded({ extended: false }), (req, res) => { if (typeof req.body.token === 'string') options.store.revokeToken(req.body.token); res.status(200).send(''); });
  return router;
}

function approvalPage(id: string, csrf: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>授权 Roblox MCP</title></head><body><main><h1>授权 Roblox Studio MCP</h1><p>允许 ChatGPT 使用当前 Studio 会话中的读取和写入工具。</p><form method="post" action="/authorize/decision"><input type="hidden" name="approval_id" value="${escapeHtml(id)}"><input type="hidden" name="csrf_token" value="${escapeHtml(csrf)}"><label>本地密码 <input type="password" name="password" required></label><button type="submit" name="action" value="approve">批准</button><button type="submit" name="action" value="deny">拒绝</button></form></main></body></html>`;
}
function text(value: unknown, name: string): string { if (typeof value !== 'string' || !value) throw new Error(name + ' is required'); return value; }
function passwordMatches(left: string, right: string): boolean { const a = createHash('sha256').update(left).digest(); const b = createHash('sha256').update(right).digest(); return timingSafeEqual(a, b); }
function oauthError(res: express.Response, status: number, code: string, error: unknown): void { res.status(status).json({ error: code, error_description: error instanceof Error ? error.message : 'OAuth request failed' }); }
function trailingSlash(url: URL): URL { const copy = new URL(url); if (!copy.pathname.endsWith('/')) copy.pathname += '/'; return copy; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char); }
