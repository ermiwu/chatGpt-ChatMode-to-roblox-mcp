import { readFile } from 'node:fs/promises';
import { describe, expect, test } from '@jest/globals';

describe('fixed Tailscale launcher', () => {
  test('validates the fixed environment and supervises the gateway', async () => {
    const script = await readFile('scripts/start-fixed.ps1', 'utf8');
    expect(script).toContain('tailscale.exe');
    expect(script).toContain('funnel status');
    expect(script).toContain('.env.local');
    expect(script).toContain('npm run build');
    expect(script).toContain('npm start');
    expect(script).toContain('logs');
    expect(script).toContain('Start-Sleep -Seconds 5');
    expect(script).not.toContain('trycloudflare.com');
    expect(script).not.toMatch(/MCP_(?:AUTH_PASSWORD|TOKEN_SECRET)\s*=\s*['"][^$]/);
  });

  test('provides a reusable fixed gateway environment check', async () => {
    const library = await readFile('scripts/lib.ps1', 'utf8');
    expect(library).toContain('function Test-FixedGatewayEnvironment');
    expect(library).toContain('PUBLIC_BASE_URL');
    expect(library).toContain('127.0.0.1:58742');
  });
});
