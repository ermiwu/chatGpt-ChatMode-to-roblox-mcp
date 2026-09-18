# Tailscale Autostart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing gateway use a stable Tailscale Funnel URL and start automatically when the current Windows user signs in.

**Architecture:** Tailscale remains an independently managed automatic Windows service and persists the public Funnel mapping. Project-owned PowerShell scripts validate that mapping, start and supervise the Node gateway, and install or remove one current-user logon task without storing credentials in Task Scheduler.

**Tech Stack:** PowerShell 5.1, Windows Task Scheduler, Tailscale CLI, Node.js 20+, Jest static safety tests, TypeScript MCP gateway.

---

### Task 1: Fixed-mode script contract

**Files:**
- Create: `tests/fixed-start.test.ts`
- Create: `scripts/start-fixed.ps1`
- Modify: `scripts/lib.ps1`

- [ ] **Step 1: Write the failing static contract test**

The test reads `scripts/start-fixed.ps1` and asserts that it checks `tailscale.exe`, calls `funnel status`, reads `.env.local`, invokes `npm run build` and `npm start`, writes under `logs`, contains a bounded restart delay, and contains neither `trycloudflare.com` nor any literal secret assignment. It also checks the PowerShell helper exposes a function that verifies the fixed public URL.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/fixed-start.test.ts`

Expected: FAIL because `scripts/start-fixed.ps1` does not exist.

- [ ] **Step 3: Implement the fixed launcher and helper**

`Test-FixedGatewayEnvironment` validates an HTTPS `PUBLIC_BASE_URL`, matching `ALLOWED_ORIGINS`, loopback host, port `58742`, Tailscale running state, and Funnel status containing both the public hostname and `127.0.0.1:58742`.

`start-fixed.ps1` loads only `.env.local`, builds and diagnoses the project, then supervises `npm start`. It appends lifecycle messages to `logs/fixed-gateway.log`, waits five seconds after abnormal exit, and stops after repeated fast failures instead of looping indefinitely.

- [ ] **Step 4: Verify tests and PowerShell syntax**

Run:

```powershell
npm test -- tests/fixed-start.test.ts
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path scripts/start-fixed.ps1), [ref]$null, [ref]$errors) | Out-Null
if ($errors.Count) { throw $errors }
```

Expected: test passes and parser reports no errors.

- [ ] **Step 5: Commit**

```powershell
git add scripts/start-fixed.ps1 scripts/lib.ps1 tests/fixed-start.test.ts
git commit -m "feat: add fixed Tailscale gateway launcher"
```

### Task 2: Autostart task management

**Files:**
- Create: `tests/autostart-script.test.ts`
- Create: `scripts/install-autostart.ps1`
- Create: `scripts/uninstall-autostart.ps1`

- [ ] **Step 1: Write failing installer safety tests**

Assert the installer uses the exact task name `WebToRobloxMcp`, an `AtLogOn` trigger for the current user, the absolute project script path, single-instance behavior, restart-on-failure settings, and starts the task after registration. Assert the uninstaller resolves and removes only the exact task name and performs no recursive file operation.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/autostart-script.test.ts`

Expected: FAIL because the task scripts do not exist.

- [ ] **Step 3: Implement installation and removal scripts**

The installer creates a hidden PowerShell action for `scripts/start-fixed.ps1`, an `AtLogOn` trigger scoped to the current Windows identity, and settings with one active instance plus three one-minute retries. It replaces only the same exact task, starts it, and prints inspection and removal commands.

The uninstaller calls `Unregister-ScheduledTask -TaskName 'WebToRobloxMcp' -Confirm:$false` only when that exact task exists.

- [ ] **Step 4: Verify tests and syntax**

Run `npm test -- tests/autostart-script.test.ts` and parse both scripts with the Windows PowerShell parser.

Expected: tests pass and no parser errors.

- [ ] **Step 5: Commit**

```powershell
git add scripts/install-autostart.ps1 scripts/uninstall-autostart.ps1 tests/autostart-script.test.ts
git commit -m "feat: add Windows logon autostart task"
```

### Task 3: Documentation and stable configuration

**Files:**
- Modify: `README.md`
- Modify: `docs/教程.md`
- Modify: `docs/Tutorial.md`
- Modify: `.env.example`
- Modify: `tests/documentation.test.ts`
- Runtime only, ignored: `.env.local`

- [ ] **Step 1: Add failing documentation checks**

Require the documentation to mention Tailscale Funnel, the fixed launcher, install/uninstall commands, the stable App URL rule, OAuth reapproval behavior, and that Studio must remain open.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/documentation.test.ts`

Expected: FAIL on the missing Tailscale automation instructions.

- [ ] **Step 3: Update documentation and ignored configuration**

Document the fixed-mode workflow in Chinese and English. Preserve Quick Tunnel as an explicitly temporary fallback. Rewrite `.env.local` with the established Tailscale base URL while preserving its existing password and token secret; never print either value.

- [ ] **Step 4: Verify**

Run: `npm test -- tests/documentation.test.ts && npm run typecheck`

Expected: documentation test and typecheck pass.

- [ ] **Step 5: Commit tracked files**

```powershell
git add README.md docs/教程.md docs/Tutorial.md .env.example tests/documentation.test.ts
git commit -m "docs: add stable Tailscale operation guide"
```

### Task 4: Install and verify automation

**Files:**
- Modify only files required by proven failures.

- [ ] **Step 1: Run the full repository checks**

Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.

Expected: 0 failures and no whitespace errors.

- [ ] **Step 2: Install and inspect the scheduled task**

Run `scripts/install-autostart.ps1`, then inspect `Get-ScheduledTask -TaskName WebToRobloxMcp` and its action, trigger, principal and settings.

Expected: task is ready or running, scoped to the current user, and points to the absolute fixed launcher.

- [ ] **Step 3: Verify local and public status**

Confirm port `58742` listens only on loopback, `tailscale funnel status` reports the stable hostname, and the public `/health` endpoint reports the built-in Roblox MCP tool count.

- [ ] **Step 4: Execute HTTPS/OAuth MCP smoke test**

Perform dynamic OAuth registration, PKCE authorization, token exchange, MCP initialize, `tools/list`, and `list_roblox_studios` through the stable Tailscale URL.

Expected: HTTPS and OAuth succeed, official tools are returned, and the open Studio is listed.

- [ ] **Step 5: Audit and push**

Ensure Git does not track `.env.local`, logs, Tailscale state or credentials. Commit only any verified fixes, push `main`, and verify the GitHub repository remains private.
