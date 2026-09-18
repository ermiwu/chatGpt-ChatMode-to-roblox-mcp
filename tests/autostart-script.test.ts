import { readFile } from 'node:fs/promises';
import { describe, expect, test } from '@jest/globals';

describe('Windows autostart scripts', () => {
  test('registers one current-user logon task for the absolute fixed launcher', async () => {
    const script = await readFile('scripts/install-autostart.ps1', 'utf8');
    expect(script).toContain("$taskName = 'WebToRobloxMcp'");
    expect(script).toContain('New-ScheduledTaskTrigger -AtLogOn');
    expect(script).toContain('$env:USERNAME');
    expect(script).toContain('start-fixed.ps1');
    expect(script).toContain('MultipleInstances IgnoreNew');
    expect(script).toContain('RestartCount 3');
    expect(script).toContain('Start-ScheduledTask');
  });

  test('removes only the exact project task', async () => {
    const script = await readFile('scripts/uninstall-autostart.ps1', 'utf8');
    expect(script).toContain("$taskName = 'WebToRobloxMcp'");
    expect(script).toContain('Unregister-ScheduledTask -TaskName $taskName');
    expect(script).not.toMatch(/Remove-Item|del\s|rm\s/i);
  });
});
