import { readFile } from 'node:fs/promises';
import { describe, expect, test } from '@jest/globals';

describe('Windows launcher', () => {
  test('starts Cloudflare and the gateway without embedded secrets', async () => {
    const script = await readFile('scripts/start.ps1', 'utf8');
    expect(script).toContain('cloudflared');
    expect(script).toContain('PUBLIC_BASE_URL');
    expect(script).toContain('MCP_AUTH_PASSWORD');
    expect(script).toContain('npm start');
    expect(script).not.toMatch(/MCP_AUTH_PASSWORD\s*=\s*['"][^$]/);
  });

  test('parses only HTTPS TryCloudflare URLs and writes env.local', async () => {
    const library = await readFile('scripts/lib.ps1', 'utf8');
    expect(library).toContain('https://');
    expect(library).toContain('trycloudflare.com');
    expect(library).toContain('.env.local');
    expect(library).not.toMatch(/Set-Content[^\r\n]+\.env(?:['"]|\s)/);
  });
});
