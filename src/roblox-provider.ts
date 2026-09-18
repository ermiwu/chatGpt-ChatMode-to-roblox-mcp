import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { GatewayStatus, RobloxToolProvider } from './remote-server.js';

export interface RobloxProviderClient {
  connect(): Promise<void>;
  listTools(): Promise<Tool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

/** 把官方 stdio 客户端包装成网页网关的数据源，并维护不含敏感信息的健康状态。 */
export class BuiltInRobloxProvider implements RobloxToolProvider {
  private connected = false;
  private studioConnected = false;
  private toolCount = 0;

  constructor(private readonly client: RobloxProviderClient) {}

  /** 启动官方 MCP，预取工具目录，并确认当前是否存在可用的 Studio 会话。 */
  async initialize(): Promise<void> {
    await this.client.connect();
    this.connected = true;
    await this.listTools();
    try {
      const result = await this.client.callTool('list_roblox_studios', {});
      this.studioConnected = hasStudio(result);
    } catch {
      this.studioConnected = false;
    }
  }

  /** 获取实时官方工具目录，让 Studio 更新后无需维护静态工具副本。 */
  async listTools(): Promise<Tool[]> {
    const tools = await this.client.listTools();
    this.connected = true;
    this.toolCount = tools.length;
    return tools;
  }

  /** 原样转发工具调用，并在查询 Studio 时同步更新健康状态。 */
  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const result = await this.client.callTool(name, args);
    this.connected = true;
    if (name === 'list_roblox_studios') this.studioConnected = hasStudio(result);
    return result;
  }

  /** 返回健康检查所需的连接、Studio 和工具数量。 */
  status(): GatewayStatus {
    return { connected: this.connected, studioConnected: this.studioConnected, toolCount: this.toolCount };
  }

  /** 关闭底层官方 MCP 进程并清空运行状态。 */
  async close(): Promise<void> {
    await this.client.close();
    this.connected = false;
    this.studioConnected = false;
    this.toolCount = 0;
  }
}

/** 判断官方 list_roblox_studios 响应是否至少包含一个 Studio。 */
function hasStudio(result: CallToolResult): boolean {
  return result.content.some(item => {
    if (item.type !== 'text') return false;
    try {
      const value = JSON.parse(item.text) as { studios?: unknown };
      return Array.isArray(value.studios) && value.studios.length > 0;
    } catch {
      return false;
    }
  });
}
