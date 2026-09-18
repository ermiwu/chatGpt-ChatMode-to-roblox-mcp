import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createHash } from 'node:crypto';
import request from 'supertest';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { OAuthStore } from '../src/oauth-store.js';
import { createRemoteServer, type RobloxToolProvider } from '../src/remote-server.js';

const base = new URL('https://gateway.example.com');
const accept = 'application/json, text/event-stream';
let store: OAuthStore;
let provider: RobloxToolProvider;
let remote: ReturnType<typeof createRemoteServer>;
let token: string;

beforeEach(() => {
  store = new OAuthStore({ issuer: base, resource: new URL('/mcp', base), tokenSecret: '0123456789abcdef0123456789abcdef' });
  token = issueToken(store);
  const listTools = jest.fn<() => Promise<Tool[]>>(async () => [
    { name: 'list_roblox_studios', inputSchema: { type: 'object', properties: {} } },
  ]);
  const callTool = jest.fn<(name: string, args: Record<string, unknown>) => Promise<CallToolResult>>(
    async (name, args) => ({ content: [{ type: 'text', text: JSON.stringify({ name, args }) }] }),
  );
  provider = {
    listTools,
    callTool,
    status: () => ({ connected: true, studioConnected: true, toolCount: 1 }),
  };
  remote = createRemoteServer({ publicBaseUrl: base, authPassword: 'password', allowedOrigins: new Set([base.origin]), store, provider });
});

afterEach(async () => remote.close());

describe('remote MCP server', () => {
  test('requires bearer authentication with protected resource metadata', async () => {
    const response = await request(remote.app).post('/mcp').send({}).expect(401);
    expect(response.headers['www-authenticate']).toContain('/.well-known/oauth-protected-resource/mcp');
  });

  test('initializes a session, lists dynamic tools, and forwards calls', async () => {
    const auth = 'Bearer ' + token;
    const initialized = await request(remote.app).post('/mcp').set('Authorization', auth).set('Accept', accept).send({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    }).expect(200);
    const sessionId = initialized.headers['mcp-session-id'];
    expect(sessionId).toBeTruthy();

    const listed = await request(remote.app).post('/mcp').set('Authorization', auth).set('Accept', accept).set('mcp-session-id', sessionId)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }).expect(200);
    expect(listed.body.result.tools[0].name).toBe('list_roblox_studios');

    const called = await request(remote.app).post('/mcp').set('Authorization', auth).set('Accept', accept).set('mcp-session-id', sessionId)
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_roblox_studios', arguments: {} } }).expect(200);
    expect(called.body.result.content[0].text).toContain('list_roblox_studios');
    expect(provider.callTool).toHaveBeenCalledWith('list_roblox_studios', {});

    await request(remote.app).delete('/mcp').set('Authorization', auth).set('Accept', accept).set('mcp-session-id', sessionId).expect(200);
    expect(remote.sessionCount()).toBe(0);
  });

  test('reports safe gateway health without secrets', async () => {
    const response = await request(remote.app).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', connected: true, studioConnected: true, toolCount: 1, sessions: 0 });
  });
});

function issueToken(oauth: OAuthStore): string {
  const redirectUri = 'https://chatgpt.com/aip/callback';
  const verifier = 'v'.repeat(64);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const client = oauth.registerClient({ redirect_uris: [redirectUri] });
  const pending = oauth.beginAuthorization(client.client_id, { redirectUri, codeChallenge: challenge, scopes: ['mcp:tools'], resource: new URL('/mcp', base) });
  const grant = oauth.approveAuthorization(pending.id, pending.csrfToken);
  return oauth.exchangeAuthorizationCode({ clientId: client.client_id, code: grant.code, codeVerifier: verifier, redirectUri, resource: new URL('/mcp', base) }).access_token;
}
