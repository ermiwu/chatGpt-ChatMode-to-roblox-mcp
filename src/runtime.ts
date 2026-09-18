import { OAuthStore } from './oauth-store.js';
import { readConfig } from './config.js';
import { RobloxMcpClient } from './roblox-client.js';
import { BuiltInRobloxProvider } from './roblox-provider.js';
import { listenRemoteServer } from './remote-server.js';

/** 组装 OAuth、网页 MCP 服务与 Roblox 官方 MCP，并注册安全的优雅退出流程。 */
export async function startGateway(env: NodeJS.ProcessEnv = process.env): Promise<() => Promise<void>> {
  const config = readConfig(env);
  const client = new RobloxMcpClient(config.roblox);
  const provider = new BuiltInRobloxProvider(client);
  await provider.initialize();

  const resource = new URL('/mcp', config.publicBaseUrl);
  const store = new OAuthStore({ issuer: config.publicBaseUrl, resource, tokenSecret: config.tokenSecret });
  const server = await listenRemoteServer({
    publicBaseUrl: config.publicBaseUrl,
    authPassword: config.authPassword,
    allowedOrigins: config.allowedOrigins,
    store,
    provider,
    host: config.host,
    port: config.port,
  });

  console.log(`网页 MCP 已监听：http://${config.host}:${server.port}/mcp`);
  console.log(`公网 MCP 地址：${resource.href}`);
  console.log(`Roblox 官方工具：${provider.status().toolCount}，Studio：${provider.status().studioConnected ? '已连接' : '未发现'}`);

  let stopping: Promise<void> | undefined;
  return async () => {
    if (!stopping) stopping = Promise.allSettled([server.close(), provider.close()]).then(() => undefined);
    await stopping;
  };
}
