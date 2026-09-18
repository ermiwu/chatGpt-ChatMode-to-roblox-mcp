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
    expect(text).not.toContain('安装第三方 Studio 插件');
    expect(text).not.toContain('58741');
  });
});
