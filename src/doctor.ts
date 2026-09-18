import { access } from 'node:fs/promises';
import path from 'node:path';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { RobloxMcpClient } from './roblox-client.js';
import { pathToFileURL } from 'node:url';

export interface DoctorClient {
  connect(): Promise<void>;
  listTools(): Promise<Tool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

export interface DoctorCheck {
  ok: boolean;
  message: string;
  count?: number;
}

export interface DoctorReport {
  mcpBat: DoctorCheck;
  handshake: DoctorCheck;
  tools: DoctorCheck;
  studios: DoctorCheck;
}

export interface DoctorOptions {
  command: string;
  fileExists: (file: string) => Promise<boolean>;
  createClient: () => DoctorClient;
}

/** 逐层检查官方 MCP 文件、协议握手、工具目录和 Studio 会话，返回可操作的诊断结论。 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const pending = (message: string): DoctorCheck => ({ ok: false, message });
  const report: DoctorReport = {
    mcpBat: pending('尚未检查 Roblox 内置 MCP'),
    handshake: pending('尚未连接 Roblox 内置 MCP'),
    tools: pending('尚未读取工具目录'),
    studios: pending('尚未查询 Roblox Studio'),
  };

  if (!(await options.fileExists(options.command))) {
    report.mcpBat = pending(`找不到 Roblox 内置 MCP：${options.command}`);
    report.handshake = pending('未启动 MCP：请先安装或更新 Roblox Studio');
    return report;
  }
  report.mcpBat = { ok: true, message: `已找到 ${options.command}` };

  const client = options.createClient();
  try {
    await client.connect();
    report.handshake = { ok: true, message: 'Roblox 内置 MCP 握手成功' };

    const tools = await client.listTools();
    report.tools = {
      ok: tools.length > 0,
      count: tools.length,
      message: tools.length > 0 ? `发现 ${tools.length} 个官方工具` : '官方 MCP 未返回任何工具',
    };

    const result = await client.callTool('list_roblox_studios', {});
    const count = studioCount(result);
    report.studios = {
      ok: count > 0,
      count,
      message: count > 0 ? `发现 ${count} 个 Roblox Studio 会话` : '未发现 Roblox Studio：请打开项目并等待 Studio 完成启动',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!report.handshake.ok) report.handshake = pending(`MCP 握手失败：${message}`);
    else if (!report.tools.ok) report.tools = pending(`读取工具失败：${message}`);
    else report.studios = pending(`读取 Studio 失败：${message}`);
  } finally {
    await client.close().catch(() => undefined);
  }
  return report;
}

/** 从官方工具的文本结果中提取 Studio 数量，并对异常响应采取保守结果。 */
function studioCount(result: CallToolResult): number {
  for (const item of result.content) {
    if (item.type !== 'text') continue;
    try {
      const parsed = JSON.parse(item.text) as { studios?: unknown };
      if (Array.isArray(parsed.studios)) return parsed.studios.length;
    } catch {
      // 继续检查其余文本块。
    }
  }
  return 0;
}

/** 使用当前 Windows 用户的 Roblox 安装执行命令行自检。 */
export async function runDefaultDoctor(env: NodeJS.ProcessEnv = process.env): Promise<DoctorReport> {
  const command = env.ROBLOX_MCP_COMMAND || path.win32.join(env.LOCALAPPDATA || '', 'Roblox', 'mcp.bat');
  const args = env.ROBLOX_MCP_ARGS_JSON ? JSON.parse(env.ROBLOX_MCP_ARGS_JSON) as string[] : [];
  return runDoctor({
    command,
    fileExists: async file => access(file).then(() => true, () => false),
    createClient: () => new RobloxMcpClient({ command, args, reconnectAttempts: 0 }),
  });
}

/** 打印适合终端阅读的逐项诊断结果，并用退出码表达整体状态。 */
async function doctorMain(): Promise<void> {
  const report = await runDefaultDoctor();
  for (const [name, check] of Object.entries(report)) console.log(`${check.ok ? '✓' : '✗'} ${name}: ${check.message}`);
  if (Object.values(report).some(check => !check.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  doctorMain().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
