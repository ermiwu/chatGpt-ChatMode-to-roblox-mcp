import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const KNOWN_READ_ONLY = new Set([
  'list_roblox_studios',
  'search_game_tree',
  'script_read',
  'script_search',
  'script_grep',
  'inspect_instance',
  'get_console_output',
  'get_studio_state',
  'screen_capture',
  'search_asset',
  'wait_job_finished',
]);

/** 保留 Roblox 官方工具模式，并为缺少安全注解的工具补充保守默认值。 */
export function normalizeTools(tools: Tool[]): Tool[] {
  return tools.map(tool => {
    if (tool.annotations) return tool;
    const readOnly = KNOWN_READ_ONLY.has(tool.name);
    return {
      ...tool,
      annotations: readOnly
        ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
        : { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    };
  });
}
