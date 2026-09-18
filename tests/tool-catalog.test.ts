import { describe, expect, test } from '@jest/globals';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { normalizeTools } from '../src/tool-catalog.js';

const tool = (name: string, extra: Partial<Tool> = {}): Tool => ({
  name,
  inputSchema: { type: 'object', properties: {} },
  ...extra,
});

describe('normalizeTools', () => {
  test('preserves official schemas and annotations', () => {
    const input = tool('official_read', {
      description: 'Official description',
      annotations: { readOnlyHint: true, destructiveHint: false },
    });

    expect(normalizeTools([input])[0]).toEqual(input);
  });

  test('marks known inspection tools read-only when annotations are missing', () => {
    expect(normalizeTools([tool('list_roblox_studios')])[0].annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  test('uses conservative write annotations for unknown tools', () => {
    expect(normalizeTools([tool('future_roblox_tool')])[0].annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
  });
});
