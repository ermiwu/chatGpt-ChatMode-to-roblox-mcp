import { afterEach, describe, expect, test } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RobloxMcpClient } from '../src/roblox-client.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-roblox-mcp.mjs');
let client: RobloxMcpClient | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe('RobloxMcpClient', () => {
  test('connects to a stdio MCP and mirrors its tools', async () => {
    client = new RobloxMcpClient({ command: process.execPath, args: [fixture], reconnectAttempts: 1 });
    await client.connect();

    const tools = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: 'list_roblox_studios', inputSchema: { type: 'object' } });
    expect(client.status()).toEqual({ connected: true, toolCount: 1 });
  });

  test('forwards tool calls without changing arguments or content', async () => {
    client = new RobloxMcpClient({ command: process.execPath, args: [fixture], reconnectAttempts: 1 });

    const result = await client.callTool('list_roblox_studios', { include: 'all' });

    expect(result.content).toEqual([{
      type: 'text',
      text: JSON.stringify({ tool: 'list_roblox_studios', arguments: { include: 'all' } }),
    }]);
  });

  test('close is safe before and after a connection', async () => {
    client = new RobloxMcpClient({ command: process.execPath, args: [fixture], reconnectAttempts: 1 });
    await client.close();
    await client.connect();
    await client.close();
    await client.close();
    expect(client.status().connected).toBe(false);
  });
});
