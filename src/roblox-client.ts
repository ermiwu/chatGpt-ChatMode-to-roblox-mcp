import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

export interface RobloxMcpClientOptions {
  command: string;
  args: string[];
  reconnectAttempts: number;
}

export interface RobloxMcpStatus {
  connected: boolean;
  toolCount: number;
}

/** 管理到 Roblox 官方 MCP 的唯一 stdio 连接，并透明转发工具发现与调用。 */
export class RobloxMcpClient {
  private client?: Client;
  private transport?: StdioClientTransport;
  private connecting?: Promise<void>;
  private toolCount = 0;

  constructor(private readonly options: RobloxMcpClientOptions) {}

  /** 建立连接并合并并发启动请求，避免重复拉起官方 MCP 子进程。 */
  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.openConnection();
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  /** 返回 Roblox 官方 MCP 当前公开的完整工具定义。 */
  async listTools(): Promise<Tool[]> {
    return this.withReconnect(async client => {
      const response = await client.listTools();
      this.toolCount = response.tools.length;
      return response.tools;
    });
  }

  /** 将工具名称和参数原样转发给 Roblox 官方 MCP。 */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    return this.withReconnect(async client => (
      await client.callTool({ name, arguments: args }) as CallToolResult
    ));
  }

  /** 返回不包含命令参数或工具结果的安全连接状态。 */
  status(): RobloxMcpStatus {
    return { connected: Boolean(this.client), toolCount: this.toolCount };
  }

  /** 幂等关闭客户端以及由传输层启动的 Roblox 官方 MCP 子进程。 */
  async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    this.toolCount = 0;
    if (client) await client.close();
  }

  /** 创建 SDK 客户端和适合当前命令类型的 stdio 传输。 */
  private async openConnection(): Promise<void> {
    const launch = windowsLaunch(this.options.command, this.options.args);
    const transport = new StdioClientTransport({ ...launch, stderr: 'pipe' });
    const client = new Client({ name: 'web-to-roblox-mcp', version: '0.1.0' });
    transport.onclose = () => {
      if (this.transport === transport) {
        this.client = undefined;
        this.transport = undefined;
        this.toolCount = 0;
      }
    };
    await client.connect(transport);
    this.transport = transport;
    this.client = client;
  }

  /** 在传输失败时清理旧连接，并按配置执行有限次数重连。 */
  private async withReconnect<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.reconnectAttempts; attempt++) {
      try {
        await this.connect();
        if (!this.client) throw new Error('Roblox MCP connection was not established');
        return await operation(this.client);
      } catch (error) {
        lastError = error;
        await this.close().catch(() => undefined);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Roblox MCP request failed');
  }
}

/** 让 Windows 批处理文件通过 cmd.exe 启动，普通可执行文件保持直接启动。 */
function windowsLaunch(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(command)) {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] };
  }
  return { command, args };
}
