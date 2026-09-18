export const version = '0.1.0';
export { readConfig } from './config.js';
export type { GatewayConfig } from './config.js';
export { RobloxMcpClient } from './roblox-client.js';
export type { RobloxMcpClientOptions, RobloxMcpStatus } from './roblox-client.js';
export { normalizeTools } from './tool-catalog.js';
export { OAuthStore } from './oauth-store.js';
export { createOAuthRouter } from './oauth-routes.js';
export { createRemoteServer, listenRemoteServer } from './remote-server.js';
export type { GatewayStatus, RobloxToolProvider, RemoteServer, ListeningRemoteServer } from './remote-server.js';
export { runDoctor, runDefaultDoctor } from './doctor.js';
export type { DoctorClient, DoctorCheck, DoctorOptions, DoctorReport } from './doctor.js';
export { BuiltInRobloxProvider } from './roblox-provider.js';
export type { RobloxProviderClient } from './roblox-provider.js';
export { startGateway } from './runtime.js';

import { pathToFileURL } from 'node:url';
import { startGateway } from './runtime.js';

/** 作为命令行入口启动网关，并在系统终止信号到达时释放端口与子进程。 */
async function main(): Promise<void> {
  const stop = await startGateway();
  const shutdown = (): void => { stop().then(() => process.exit(0), error => { console.error(error); process.exit(1); }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
