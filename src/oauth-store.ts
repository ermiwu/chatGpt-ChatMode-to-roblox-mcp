import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export interface OAuthClientMetadata { redirect_uris: string[]; client_name?: string; token_endpoint_auth_method?: 'none' }
export interface RegisteredOAuthClient extends OAuthClientMetadata { client_id: string; client_id_issued_at: number }
export interface AuthorizationRequest {
  redirectUri: string; codeChallenge: string; state?: string; scopes: string[]; resource: URL;
}
export interface PendingAuthorization extends AuthorizationRequest {
  id: string; csrfToken: string; clientId: string; expiresAt: number;
}
export interface OAuthTokens {
  access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string;
}

interface OAuthStoreOptions { issuer: URL; resource: URL; tokenSecret: string; now?: () => number }
interface CodeRecord extends AuthorizationRequest { clientId: string; expiresAt: number }
interface RefreshRecord { clientId: string; scopes: string[]; resource: string; expiresAt: number }
interface AccessPayload { iss: string; aud: string; sub: string; client_id: string; scope: string; iat: number; exp: number; jti: string }

/** 在内存中管理单用户 OAuth 客户端、授权码和受众绑定令牌。 */
export class OAuthStore {
  private readonly issuer: string;
  private readonly resource: string;
  private readonly secret: Buffer;
  private readonly now: () => number;
  private readonly clients = new Map<string, RegisteredOAuthClient>();
  private readonly pending = new Map<string, PendingAuthorization>();
  private readonly codes = new Map<string, CodeRecord>();
  private readonly refresh = new Map<string, RefreshRecord>();
  private readonly revoked = new Set<string>();

  constructor(options: OAuthStoreOptions) {
    this.issuer = normalize(options.issuer);
    this.resource = normalize(options.resource);
    this.secret = Buffer.from(options.tokenSecret);
    this.now = options.now ?? Date.now;
  }

  /** 注册仅使用 PKCE 的公开 OAuth 客户端。 */
  registerClient(metadata: OAuthClientMetadata): RegisteredOAuthClient {
    if (!Array.isArray(metadata.redirect_uris) || metadata.redirect_uris.length === 0) {
      throw new Error('redirect_uris must contain at least one URI');
    }
    if (metadata.token_endpoint_auth_method && metadata.token_endpoint_auth_method !== 'none') {
      throw new Error('only public OAuth clients are supported');
    }
    const client: RegisteredOAuthClient = {
      ...metadata,
      redirect_uris: metadata.redirect_uris.map(validateRedirectUri),
      token_endpoint_auth_method: 'none',
      client_id: randomValue(),
      client_id_issued_at: Math.floor(this.now() / 1000),
    };
    this.clients.set(client.client_id, client);
    return client;
  }

  /** 创建一次性授权审批，并校验客户端、回调地址和 MCP 资源。 */
  beginAuthorization(clientId: string, request: AuthorizationRequest): PendingAuthorization {
    const client = this.clients.get(clientId);
    if (!client) throw new Error('unknown OAuth client');
    if (!client.redirect_uris.includes(request.redirectUri)) throw new Error('redirect_uri is not registered');
    this.assertResource(request.resource);
    if (!request.codeChallenge) throw new Error('PKCE S256 is required');
    const approval: PendingAuthorization = {
      ...request, clientId, id: randomValue(), csrfToken: randomValue(), expiresAt: this.now() + 10 * 60_000,
    };
    this.pending.set(approval.id, approval);
    return { ...approval };
  }

  /** 读取仍有效的授权审批，并可选验证 CSRF 令牌。 */
  getPendingAuthorization(id: string, csrfToken?: string): PendingAuthorization {
    const approval = this.pending.get(id);
    if (!approval || approval.expiresAt <= this.now()) {
      this.pending.delete(id);
      throw new Error('authorization request is invalid or expired');
    }
    if (csrfToken && !safeEqual(approval.csrfToken, csrfToken)) throw new Error('authorization request CSRF validation failed');
    return { ...approval };
  }

  /** 消耗审批并签发只能使用一次的短期授权码。 */
  approveAuthorization(id: string, csrfToken: string): PendingAuthorization & { code: string } {
    const approval = this.getPendingAuthorization(id, csrfToken);
    this.pending.delete(id);
    const code = randomValue();
    this.codes.set(hash(code), { ...approval, expiresAt: this.now() + 5 * 60_000 });
    return { ...approval, code };
  }

  /** 取消并消耗当前审批。 */
  denyAuthorization(id: string, csrfToken: string): PendingAuthorization {
    const approval = this.getPendingAuthorization(id, csrfToken);
    this.pending.delete(id);
    return approval;
  }

  /** 校验 PKCE 授权码并签发访问令牌和轮换刷新令牌。 */
  exchangeAuthorizationCode(input: { clientId: string; code: string; codeVerifier: string; redirectUri: string; resource: URL }): OAuthTokens {
    const record = this.codes.get(hash(input.code));
    this.codes.delete(hash(input.code));
    if (!record || record.expiresAt <= this.now()) throw new Error('authorization code is invalid or expired');
    if (record.clientId !== input.clientId || record.redirectUri !== input.redirectUri) throw new Error('authorization code client or redirect mismatch');
    this.assertResource(input.resource);
    if (normalize(record.resource) !== normalize(input.resource)) throw new Error('authorization code resource mismatch');
    if (!safeEqual(record.codeChallenge, createHash('sha256').update(input.codeVerifier).digest('base64url'))) {
      throw new Error('PKCE verification failed');
    }
    return this.issueTokens(record.clientId, record.scopes, normalize(input.resource));
  }

  /** 消耗旧刷新令牌并签发一组新令牌。 */
  exchangeRefreshToken(input: { clientId: string; refreshToken: string; resource: URL; scopes?: string[] }): OAuthTokens {
    const record = this.refresh.get(hash(input.refreshToken));
    this.refresh.delete(hash(input.refreshToken));
    if (!record || record.expiresAt <= this.now()) throw new Error('refresh token is invalid or expired');
    if (record.clientId !== input.clientId || record.resource !== normalize(input.resource)) throw new Error('refresh token client or resource mismatch');
    const scopes = input.scopes?.length ? input.scopes : record.scopes;
    if (scopes.some(scope => !record.scopes.includes(scope))) throw new Error('refresh token scope escalation is not allowed');
    return this.issueTokens(record.clientId, scopes, record.resource);
  }

  /** 验证访问令牌签名、有效期、撤销状态和 MCP 资源受众。 */
  verifyAccessToken(token: string): AuthInfo {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra) throw new Error('access token is invalid or expired');
    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    if (!safeEqual(signature, expected)) throw new Error('access token is invalid or expired');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessPayload;
    if (payload.iss !== this.issuer || payload.aud !== this.resource || payload.exp <= Math.floor(this.now() / 1000) || this.revoked.has(payload.jti) || !this.clients.has(payload.client_id)) {
      throw new Error('access token is invalid or expired');
    }
    return { token, clientId: payload.client_id, scopes: payload.scope.split(' ').filter(Boolean), expiresAt: payload.exp, resource: new URL(payload.aud) };
  }

  /** 撤销访问令牌或删除刷新令牌。 */
  revokeToken(token: string): void {
    if (!token.includes('.')) { this.refresh.delete(hash(token)); return; }
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')) as AccessPayload;
      if (payload.jti) this.revoked.add(payload.jti);
    } catch { /* 无效令牌按已撤销处理。 */ }
  }

  /** 创建带签名的短期访问令牌和一次性刷新令牌。 */
  private issueTokens(clientId: string, scopes: string[], resource: string): OAuthTokens {
    const now = Math.floor(this.now() / 1000);
    const payload: AccessPayload = { iss: this.issuer, aud: resource, sub: 'roblox-studio-user', client_id: clientId, scope: scopes.join(' '), iat: now, exp: now + 600, jti: randomValue() };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const accessToken = body + '.' + createHmac('sha256', this.secret).update(body).digest('base64url');
    const refreshToken = randomValue();
    this.refresh.set(hash(refreshToken), { clientId, scopes: [...scopes], resource, expiresAt: this.now() + 30 * 24 * 60 * 60_000 });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: 600, refresh_token: refreshToken, scope: scopes.join(' ') };
  }

  /** 强制所有令牌只面向当前 MCP 资源。 */
  private assertResource(resource: URL): void {
    if (normalize(resource) !== this.resource) throw new Error('resource does not match this MCP server');
  }
}

function validateRedirectUri(value: string): string {
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('redirect_uri must use HTTPS or loopback HTTP');
  if (url.hash || url.username || url.password) throw new Error('redirect_uri contains forbidden components');
  return url.href;
}
function normalize(url: URL): string { const copy = new URL(url); copy.hash = ''; return copy.href; }
function randomValue(): string { return randomBytes(32).toString('base64url'); }
function hash(value: string): string { return createHash('sha256').update(value).digest('base64url'); }
function safeEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
