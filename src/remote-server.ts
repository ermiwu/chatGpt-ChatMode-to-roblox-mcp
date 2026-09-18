import { randomUUID } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, isInitializeRequest, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { createOAuthRouter } from './oauth-routes.js';
import { OAuthStore } from './oauth-store.js';
import { normalizeTools } from './tool-catalog.js';

export interface GatewayStatus { connected: boolean; studioConnected: boolean; toolCount: number }
export interface RobloxToolProvider {
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
  status(): GatewayStatus;
}
interface RemoteServerOptions {
  publicBaseUrl: URL;
  authPassword: string;
  allowedOrigins: ReadonlySet<string>;
  store: OAuthStore;
  provider: RobloxToolProvider;
}
interface RemoteSession { transport: StreamableHTTPServerTransport; server: Server }
export interface RemoteServer {
  app: express.Express;
  sessionCount(): number;
  close(): Promise<void>;
}
export interface ListeningRemoteServer extends RemoteServer { httpServer: http.Server; port: number }

/** 为网页会话建立 MCP 服务，并把动态工具操作透明转发到 Roblox 官方 MCP。 */
export function createRemoteServer(options: RemoteServerOptions): RemoteServer {
  const app = express();
  const sessions = new Map<string, RemoteSession>();
  const metadataUrl = new URL('/.well-known/oauth-protected-resource/mcp', options.publicBaseUrl).href;
  const allowedHosts = new Set([options.publicBaseUrl.host.toLowerCase(), options.publicBaseUrl.hostname.toLowerCase(), '127.0.0.1', 'localhost', '[::1]']);
  app.disable('x-powered-by');
  app.use(createOAuthRouter({ publicBaseUrl: options.publicBaseUrl, authPassword: options.authPassword, store: options.store }));
  app.get('/health', (_req, res) => {
    const status = options.provider.status();
    res.json({ status: 'ok', ...status, sessions: sessions.size });
  });

  app.use('/mcp', (req, res, next) => {
    const host = (req.get('host') || '').toLowerCase();
    const hostname = host.startsWith('[') ? host.split(']')[0] + ']' : host.split(':')[0];
    if (!allowedHosts.has(host) && !allowedHosts.has(hostname)) { res.status(403).json({ error: 'Host is not allowed' }); return; }
    const origin = req.get('origin');
    if (origin && !options.allowedOrigins.has(origin)) { res.status(403).json({ error: 'Origin is not allowed' }); return; }
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) { unauthorized(res, metadataUrl); return; }
    try {
      options.store.verifyAccessToken(header.slice(7));
      next();
    } catch { unauthorized(res, metadataUrl); }
  });

  app.post('/mcp', express.json({ limit: '50mb' }), async (req, res) => {
    try {
      const sessionId = readSessionId(req);
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) { res.status(404).json(mcpError('Unknown MCP session')); return; }
        await session.transport.handleRequest(req, res, req.body);
        return;
      }
      if (!isInitializeRequest(req.body)) { res.status(400).json(mcpError('An initialize request is required')); return; }

      let server!: Server;
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: (id: string): void => { sessions.set(id, { transport, server }); },
      });
      server = createProxyProtocolServer(options.provider);
      transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) res.status(500).json(mcpError(error instanceof Error ? error.message : 'MCP request failed'));
    }
  });

  const existingSession = async (req: express.Request, res: express.Response): Promise<void> => {
    const sessionId = readSessionId(req);
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) { res.status(404).json(mcpError('Unknown MCP session')); return; }
    try { await session.transport.handleRequest(req, res); }
    catch (error) { if (!res.headersSent) res.status(500).json(mcpError(error instanceof Error ? error.message : 'MCP request failed')); }
  };
  app.get('/mcp', existingSession);
  app.delete('/mcp', existingSession);

  return {
    app,
    sessionCount: () => sessions.size,
    close: async () => {
      const active = [...sessions.values()];
      sessions.clear();
      await Promise.allSettled(active.map(async session => { await session.transport.close(); await session.server.close(); }));
    },
  };
}

/** 绑定仅监听本机环回地址的 HTTP 服务。 */
export async function listenRemoteServer(options: RemoteServerOptions & { host: string; port: number }): Promise<ListeningRemoteServer> {
  const remote = createRemoteServer(options);
  const httpServer = http.createServer(remote.app);
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host, resolve);
  });
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  return {
    ...remote, httpServer, port,
    close: async () => {
      await remote.close();
      await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
    },
  };
}

/** 创建动态读取工具目录的单个 MCP 协议会话。 */
function createProxyProtocolServer(provider: RobloxToolProvider): Server {
  const server = new Server({ name: 'web-to-roblox-mcp', version: '0.1.0' }, { capabilities: { tools: { listChanged: true } } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: normalizeTools(await provider.listTools()) }));
  server.setRequestHandler(CallToolRequestSchema, async request => (
    provider.callTool(request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>)
  ));
  return server;
}

function unauthorized(res: express.Response, metadataUrl: string): void {
  res.set('WWW-Authenticate', `Bearer resource_metadata="${metadataUrl}"`);
  res.status(401).json({ error: 'unauthorized' });
}
function readSessionId(req: express.Request): string | undefined { const value = req.headers['mcp-session-id']; return Array.isArray(value) ? value[0] : value; }
function mcpError(message: string) { return { jsonrpc: '2.0', error: { code: -32000, message }, id: null }; }
