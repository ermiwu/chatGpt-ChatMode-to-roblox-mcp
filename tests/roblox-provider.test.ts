import { describe, expect, jest, test } from '@jest/globals';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { BuiltInRobloxProvider, type RobloxProviderClient } from '../src/roblox-provider.js';

describe('BuiltInRobloxProvider', () => {
  test('tracks tools and an active Studio session', async () => {
    const client: RobloxProviderClient = {
      connect: jest.fn(async () => undefined),
      listTools: jest.fn(async (): Promise<Tool[]> => [{ name: 'list_roblox_studios', inputSchema: { type: 'object' } }]),
      callTool: jest.fn(async (): Promise<CallToolResult> => ({ content: [{ type: 'text', text: '{"studios":[{"id":"1"}]}' }] })),
      close: jest.fn(async () => undefined),
    };
    const provider = new BuiltInRobloxProvider(client);

    await provider.initialize();
    expect(provider.status()).toEqual({ connected: true, studioConnected: true, toolCount: 1 });
    expect(await provider.listTools()).toHaveLength(1);
    await provider.close();
  });
});
