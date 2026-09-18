import { describe, expect, jest, test } from '@jest/globals';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { runDoctor, type DoctorClient } from '../src/doctor.js';

const connectedClient = (studios: unknown[]): DoctorClient => ({
  connect: jest.fn(async () => undefined),
  listTools: jest.fn(async (): Promise<Tool[]> => [
    { name: 'list_roblox_studios', inputSchema: { type: 'object', properties: {} } },
  ]),
  callTool: jest.fn(async (): Promise<CallToolResult> => ({
    content: [{ type: 'text', text: JSON.stringify({ studios }) }],
  })),
  close: jest.fn(async () => undefined),
});

describe('runDoctor', () => {
  test('reports a connected Studio and discovered tools', async () => {
    const report = await runDoctor({
      command: 'C:\\Roblox\\mcp.bat',
      fileExists: async () => true,
      createClient: () => connectedClient([{ id: 'studio-1', name: 'Dungeon' }]),
    });

    expect(report).toMatchObject({
      mcpBat: { ok: true }, handshake: { ok: true }, tools: { ok: true, count: 1 },
      studios: { ok: true, count: 1 },
    });
  });

  test('treats an empty Studio list as an actionable warning', async () => {
    const report = await runDoctor({ command: 'C:\\Roblox\\mcp.bat', fileExists: async () => true, createClient: () => connectedClient([]) });
    expect(report.studios).toMatchObject({ ok: false, count: 0 });
    expect(report.studios.message).toContain('Studio');
  });

  test('stops before spawning when mcp.bat is missing', async () => {
    const createClient = jest.fn<() => DoctorClient>();
    const report = await runDoctor({ command: 'missing.bat', fileExists: async () => false, createClient });
    expect(report.mcpBat.ok).toBe(false);
    expect(report.handshake.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});
