import { readFile } from 'node:fs/promises';
import { describe, expect, test } from '@jest/globals';

describe('Chinese documentation', () => {
  test('covers setup, authorization, reads, writes, and troubleshooting', async () => {
    const readme = await readFile('README.md', 'utf8');
    const tutorial = await readFile('docs/教程.md', 'utf8');
    const text = readme + tutorial;
    for (const phrase of ['启用 Studio 作为 MCP 服务器', 'ChatGPT Developer Mode', 'OAuth', 'Cloudflare', 'list_roblox_studios', '停止服务', '故障排查']) {
      expect(text).toContain(phrase);
    }
    for (const phrase of ['Tailscale Funnel', 'start-fixed.ps1', 'install-autostart.ps1', 'uninstall-autostart.ps1', '固定地址', '重新批准']) {
      expect(text).toContain(phrase);
    }
    for (const phrase of ['不需要购买域名', '每位用户', 'tailscale funnel --bg --yes', '自己的固定地址']) {
      expect(text).toContain(phrase);
    }
    expect(text).not.toContain('安装第三方 Studio 插件');
    expect(text).not.toContain('58741');
  });
});
