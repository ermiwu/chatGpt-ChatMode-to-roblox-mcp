import path from 'node:path';

export interface GatewayConfig {
  publicBaseUrl: URL;
  host: '127.0.0.1' | 'localhost' | '::1';
  port: number;
  authPassword: string;
  tokenSecret: string;
  allowedOrigins: ReadonlySet<string>;
  roblox: {
    command: string;
    args: string[];
    reconnectAttempts: number;
  };
}

/** 读取并验证公网网关与 Roblox 官方 MCP 子进程的全部启动配置。 */
export function readConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): GatewayConfig {
  const publicBaseUrl = readHttpsUrl(env.PUBLIC_BASE_URL);
  const host = env.REMOTE_HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('REMOTE_HOST must be loopback');
  }

  const port = Number(env.REMOTE_PORT ?? '58742');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('REMOTE_PORT must be an integer between 1 and 65535');
  }

  const authPassword = required(env.MCP_AUTH_PASSWORD, 'MCP_AUTH_PASSWORD');
  const tokenSecret = required(env.MCP_TOKEN_SECRET, 'MCP_TOKEN_SECRET');
  if (tokenSecret.length < 32) throw new Error('MCP_TOKEN_SECRET must contain at least 32 characters');

  const localAppData = required(env.LOCALAPPDATA, 'LOCALAPPDATA');
  const command = env.ROBLOX_MCP_COMMAND || path.win32.join(localAppData, 'Roblox', 'mcp.bat');
  const args = readStringArray(env.ROBLOX_MCP_ARGS_JSON);
  const reconnectAttempts = Number(env.ROBLOX_MCP_RECONNECT_ATTEMPTS ?? '1');
  if (!Number.isInteger(reconnectAttempts) || reconnectAttempts < 0 || reconnectAttempts > 5) {
    throw new Error('ROBLOX_MCP_RECONNECT_ATTEMPTS must be an integer between 0 and 5');
  }

  const allowedOrigins = new Set(
    (env.ALLOWED_ORIGINS || publicBaseUrl.origin)
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => new URL(value).origin),
  );

  return {
    publicBaseUrl,
    host,
    port,
    authPassword,
    tokenSecret,
    allowedOrigins,
    roblox: { command, args, reconnectAttempts },
  };
}

/** 验证公开地址仅使用无凭据的 HTTPS 根地址。 */
function readHttpsUrl(value: string | undefined): URL {
  const url = new URL(required(value, 'PUBLIC_BASE_URL'));
  if (url.protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use HTTPS');
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('PUBLIC_BASE_URL must not contain credentials, query, or fragment');
  }
  return url;
}

/** 将可选 JSON 参数解析成纯字符串数组。 */
function readStringArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error();
    return parsed;
  } catch {
    throw new Error('ROBLOX_MCP_ARGS_JSON must be a JSON string array');
  }
}

/** 读取必需的非空环境变量。 */
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
