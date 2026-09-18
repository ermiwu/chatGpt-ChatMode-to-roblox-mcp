import { describe, expect, test } from '@jest/globals';
import { readConfig } from '../src/config.js';

const valid = {
  PUBLIC_BASE_URL: 'https://gateway.example.com',
  MCP_AUTH_PASSWORD: 'a-strong-local-password',
  MCP_TOKEN_SECRET: '0123456789abcdef0123456789abcdef',
  LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local',
};

describe('readConfig', () => {
  test('uses safe defaults for Windows and loopback HTTP', () => {
    const config = readConfig(valid);
    expect(config.roblox.command).toBe('C:\\Users\\Tester\\AppData\\Local\\Roblox\\mcp.bat');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(58742);
    expect(config.allowedOrigins).toEqual(new Set(['https://gateway.example.com']));
  });

  test('accepts an explicit Roblox command and JSON arguments', () => {
    const config = readConfig({
      ...valid,
      ROBLOX_MCP_COMMAND: 'node',
      ROBLOX_MCP_ARGS_JSON: '["fake.mjs","--stdio"]',
      ROBLOX_MCP_RECONNECT_ATTEMPTS: '2',
    });
    expect(config.roblox).toEqual({ command: 'node', args: ['fake.mjs', '--stdio'], reconnectAttempts: 2 });
  });

  test.each([
    [{ ...valid, PUBLIC_BASE_URL: 'http://gateway.example.com' }, 'PUBLIC_BASE_URL must use HTTPS'],
    [{ ...valid, REMOTE_HOST: '0.0.0.0' }, 'REMOTE_HOST must be loopback'],
    [{ ...valid, REMOTE_PORT: '70000' }, 'REMOTE_PORT must be an integer between 1 and 65535'],
    [{ ...valid, MCP_TOKEN_SECRET: 'short' }, 'MCP_TOKEN_SECRET must contain at least 32 characters'],
    [{ ...valid, ROBLOX_MCP_ARGS_JSON: '{}' }, 'ROBLOX_MCP_ARGS_JSON must be a JSON string array'],
  ])('rejects unsafe configuration', (env, message) => {
    expect(() => readConfig(env)).toThrow(message);
  });
});
