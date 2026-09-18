# Web to Roblox Built-in MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first, OAuth-protected HTTPS MCP gateway that dynamically proxies ChatGPT web requests to Roblox Studio's built-in stdio MCP server without a third-party Studio plugin.

**Architecture:** A local TypeScript process acts as an MCP client toward `%LOCALAPPDATA%\Roblox\mcp.bat` and as a Streamable HTTP MCP server toward ChatGPT. It dynamically mirrors Roblox tool schemas and calls, keeps OAuth and Roblox credentials separated, and supplies a Windows launcher plus a diagnostic command.

**Tech Stack:** Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, Express, Jest, Supertest, Cloudflare Tunnel, PowerShell, Git.

---

## File map

- `package.json`: scripts and runtime dependencies.
- `tsconfig.json`, `jest.config.js`: TypeScript and Jest configuration.
- `.gitignore`, `.env.example`: safe local configuration defaults.
- `src/config.ts`: validate remote and Roblox process configuration.
- `src/roblox-client.ts`: own the official stdio MCP process and reconnect behavior.
- `src/tool-catalog.ts`: normalize dynamically discovered Roblox tools.
- `src/oauth-store.ts`: register clients and issue short-lived audience-bound tokens.
- `src/oauth-routes.ts`: OAuth discovery, approval, token and revocation routes.
- `src/remote-server.ts`: authenticated Streamable HTTP MCP endpoint.
- `src/doctor.ts`: diagnose local prerequisites and Studio registration.
- `src/index.ts`: compose lifecycle and graceful shutdown.
- `scripts/start.ps1`: create local secrets, start a quick tunnel and launch the gateway.
- `tests/fake-roblox-mcp.mjs`: deterministic stdio MCP fixture.
- `tests/*.test.ts`: unit and integration coverage.
- `README.md`, `docs/教程.md`: quick start and full Chinese guide.

### Task 1: Scaffold the clean TypeScript package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/index.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, test } from '@jest/globals';
import { version } from '../src/index.js';

describe('package smoke test', () => {
  test('exports a semantic version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Add package and compiler configuration, then verify RED**

```json
{
  "name": "web-to-roblox-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand",
    "start": "node dist/index.js",
    "doctor": "node dist/doctor.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.30.0",
    "express": "^4.21.2"
  },
  "devDependencies": {
    "@jest/globals": "^29.7.0",
    "@types/express": "^5.0.3",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.15.3",
    "@types/supertest": "^6.0.3",
    "jest": "^29.7.0",
    "supertest": "^7.1.1",
    "typescript": "^5.8.3"
  }
}
```

Run: `npm install && npm test -- tests/smoke.test.ts`
Expected: FAIL because `src/index.ts` does not export `version`.

- [ ] **Step 3: Add the minimal entry module**

```ts
export const version = '0.1.0';
```

Configure `tsconfig.json` for NodeNext, `src` plus `tests`, strict mode, and `dist`; configure Jest for ESM. Ignore `node_modules/`, `dist/`, `.env.local`, `.tools/`, `logs/` and `coverage/`. Document every supported variable in `.env.example` without real secrets.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/smoke.test.ts && npm run typecheck && npm run build`
Expected: 1 test passes; typecheck and build exit 0.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json tsconfig.json jest.config.js .gitignore .env.example src/index.ts tests/smoke.test.ts
git commit -m "build: scaffold Roblox web MCP gateway"
```

### Task 2: Validate local and public configuration

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing configuration tests**

```ts
import { describe, expect, test } from '@jest/globals';
import { readConfig } from '../src/config.js';

const valid = {
  PUBLIC_BASE_URL: 'https://gateway.example.com',
  MCP_AUTH_PASSWORD: 'a-strong-local-password',
  MCP_TOKEN_SECRET: '0123456789abcdef0123456789abcdef',
  LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local',
};

test('uses the built-in Roblox mcp.bat by default', () => {
  expect(readConfig(valid).roblox.command).toBe('C:\\Users\\Tester\\AppData\\Local\\Roblox\\mcp.bat');
});

test.each([
  [{ ...valid, PUBLIC_BASE_URL: 'http://gateway.example.com' }, 'PUBLIC_BASE_URL must use HTTPS'],
  [{ ...valid, REMOTE_HOST: '0.0.0.0' }, 'REMOTE_HOST must be loopback'],
  [{ ...valid, MCP_TOKEN_SECRET: 'short' }, 'MCP_TOKEN_SECRET must contain at least 32 characters'],
])('rejects unsafe configuration', (env, message) => {
  expect(() => readConfig(env)).toThrow(message);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL because `src/config.ts` does not exist.

- [ ] **Step 3: Implement the validated configuration API**

```ts
export interface GatewayConfig {
  publicBaseUrl: URL;
  host: '127.0.0.1' | 'localhost' | '::1';
  port: number;
  authPassword: string;
  tokenSecret: string;
  allowedOrigins: ReadonlySet<string>;
  roblox: { command: string; args: string[]; reconnectAttempts: number };
}

/** 读取并验证公网网关与 Roblox 官方 MCP 子进程的全部启动配置。 */
export function readConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): GatewayConfig {
  // Validate HTTPS, loopback, ports, secrets and the Windows default command.
}
```

Support `ROBLOX_MCP_COMMAND` and `ROBLOX_MCP_ARGS_JSON` overrides for diagnostics, while defaulting to `%LOCALAPPDATA%\Roblox\mcp.bat` with no arguments.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/config.test.ts && npm run typecheck`
Expected: all configuration tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/config.ts src/index.ts tests/config.test.ts
git commit -m "feat: validate gateway configuration"
```

### Task 3: Connect to Roblox Studio's built-in stdio MCP

**Files:**
- Create: `src/roblox-client.ts`
- Create: `tests/fake-roblox-mcp.mjs`
- Create: `tests/roblox-client.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create a fake stdio MCP fixture**

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'fake-roblox', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: 'list_roblox_studios', description: 'List Studios', inputSchema: { type: 'object' } }],
}));
server.setRequestHandler(CallToolRequestSchema, async request => ({
  content: [{ type: 'text', text: JSON.stringify({ tool: request.params.name, arguments: request.params.arguments }) }],
}));
await server.connect(new StdioServerTransport());
```

- [ ] **Step 2: Write failing lifecycle and forwarding tests**

```ts
const client = new RobloxMcpClient({
  command: process.execPath,
  args: ['tests/fake-roblox-mcp.mjs'],
  reconnectAttempts: 1,
});
await client.connect();
expect((await client.listTools()).map(tool => tool.name)).toContain('list_roblox_studios');
expect(await client.callTool('list_roblox_studios', {})).toMatchObject({ content: expect.any(Array) });
await client.close();
```

Add a fixture mode that exits after initialization and assert one controlled reconnect occurs rather than parallel child creation.

- [ ] **Step 3: Verify RED**

Run: `npm test -- tests/roblox-client.test.ts`
Expected: FAIL because `RobloxMcpClient` does not exist.

- [ ] **Step 4: Implement the client lifecycle**

```ts
export class RobloxMcpClient {
  private client?: Client;
  private transport?: StdioClientTransport;
  private connecting?: Promise<void>;

  /** 建立并维护到 Roblox 官方 MCP 的唯一 stdio 连接。 */
  async connect(): Promise<void> { /* serialize connect and handshake */ }

  /** 返回官方 MCP 当前公开的完整工具定义。 */
  async listTools(): Promise<Tool[]> { /* call SDK listTools */ }

  /** 将工具名称和参数原样转发给 Roblox 官方 MCP。 */
  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> { /* retry once after transport failure */ }

  /** 关闭客户端以及由网关启动的官方 MCP 子进程。 */
  async close(): Promise<void> { /* idempotent cleanup */ }
}
```

On Windows, run `.bat` through `cmd.exe /d /s /c`; direct executable overrides run without a shell. Never log stdin/stdout frames containing tool arguments or results.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- tests/roblox-client.test.ts && npm run typecheck`
Expected: lifecycle, forwarding and reconnect tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/roblox-client.ts src/index.ts tests/fake-roblox-mcp.mjs tests/roblox-client.test.ts
git commit -m "feat: connect to Roblox built-in MCP"
```

### Task 4: Mirror the dynamic Roblox tool catalog

**Files:**
- Create: `src/tool-catalog.ts`
- Create: `tests/tool-catalog.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing catalog tests**

```ts
test('preserves official schemas and applies conservative annotations', () => {
  const catalog = normalizeTools([{ name: 'multi_edit', inputSchema: { type: 'object' } }]);
  expect(catalog[0]).toMatchObject({
    name: 'multi_edit',
    inputSchema: { type: 'object' },
    annotations: { readOnlyHint: false, destructiveHint: true },
  });
});

test('marks known inspection tools read-only when Roblox omits annotations', () => {
  expect(normalizeTools([{ name: 'list_roblox_studios', inputSchema: { type: 'object' } }])[0].annotations)
    .toMatchObject({ readOnlyHint: true, destructiveHint: false });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/tool-catalog.test.ts`
Expected: FAIL because `normalizeTools` does not exist.

- [ ] **Step 3: Implement normalization**

```ts
const KNOWN_READ_ONLY = new Set(['list_roblox_studios', 'script_read', 'script_search', 'script_grep']);

/** 保留官方工具模式，并为缺少安全注解的工具补充保守默认值。 */
export function normalizeTools(tools: Tool[]): Tool[] {
  return tools.map(tool => ({
    ...tool,
    annotations: tool.annotations ?? (KNOWN_READ_ONLY.has(tool.name)
      ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      : { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }),
  }));
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/tool-catalog.test.ts`
Expected: all catalog tests pass.

```powershell
git add src/tool-catalog.ts src/index.ts tests/tool-catalog.test.ts
git commit -m "feat: mirror Roblox MCP tool catalog"
```

### Task 5: Add single-user OAuth with PKCE

**Files:**
- Create: `src/oauth-store.ts`
- Create: `src/oauth-routes.ts`
- Create: `tests/oauth-store.test.ts`
- Create: `tests/oauth-routes.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing store tests**

Cover dynamic registration, exact HTTPS redirect URIs, PKCE S256, one-time codes, audience binding, 10-minute access tokens, rotating refresh tokens and revocation. Use a deterministic clock and random source.

```ts
const store = new OAuthStore({ issuer, resource, tokenSecret, now, randomBytes });
const client = store.registerClient({ redirect_uris: ['https://chatgpt.com/aip/callback'] });
const pending = store.beginAuthorization(client.client_id, request);
const grant = store.approveAuthorization(pending.id, pending.csrfToken);
expect(store.exchangeAuthorizationCode(exchange).token_type).toBe('Bearer');
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/oauth-store.test.ts`
Expected: FAIL because `OAuthStore` does not exist.

- [ ] **Step 3: Implement the in-memory store**

Implement typed records for registered clients, pending approvals, authorization codes, refresh tokens and HMAC-signed access tokens. Compare secrets with constant-time hashes and never serialize the configured password.

- [ ] **Step 4: Write failing route tests**

```ts
const resource = await request(app).get('/.well-known/oauth-protected-resource/mcp').expect(200);
expect(resource.body.resource).toBe('https://gateway.example.com/mcp');
const metadata = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
expect(metadata.body.code_challenge_methods_supported).toEqual(['S256']);
expect(authorization.headers['content-security-policy']).toContain("form-action 'self' https://chatgpt.com");
```

Also assert five incorrect passwords are throttled without echoing input, and that a valid approval redirects exactly once to the registered callback.

- [ ] **Step 5: Implement routes and verify GREEN**

Implement `/register`, `/authorize`, `/authorize/decision`, `/token`, `/revoke`, both protected-resource metadata routes, and authorization-server metadata. The approval page uses an exact registered redirect origin in CSP so the cross-site 302 is not blocked.

Run: `npm test -- tests/oauth-store.test.ts tests/oauth-routes.test.ts`
Expected: all OAuth tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/oauth-store.ts src/oauth-routes.ts src/index.ts tests/oauth-store.test.ts tests/oauth-routes.test.ts
git commit -m "feat: protect gateway with OAuth"
```

### Task 6: Expose the authenticated Streamable HTTP proxy

**Files:**
- Create: `src/remote-server.ts`
- Create: `tests/remote-server.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing remote server tests**

Create a fake Roblox client with dynamic tool definitions and call recording. Test:

```ts
await request(app).post('/mcp').send(initializeRequest).expect(401);
const initialize = await request(app).post('/mcp').set('Authorization', 'Bearer ' + token).send(initializeRequest).expect(200);
const sessionId = initialize.headers['mcp-session-id'];
const listed = await request(app).post('/mcp').set(auth).set('mcp-session-id', sessionId).send(listToolsRequest).expect(200);
expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toContain('list_roblox_studios');
await request(app).post('/mcp').set(auth).set('mcp-session-id', sessionId).send(callToolRequest).expect(200);
expect(fakeRoblox.callTool).toHaveBeenCalledWith('list_roblox_studios', {});
```

Assert rejected Host and Origin headers, unknown sessions, DELETE cleanup, and a health response containing `robloxConnected`, `studioConnected`, `toolCount` and `sessions`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/remote-server.test.ts`
Expected: FAIL because `createRemoteServer` does not exist.

- [ ] **Step 3: Implement dynamic protocol sessions**

```ts
export interface RobloxToolProvider {
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
  status(): GatewayStatus;
}

/** 为每个网页会话建立 MCP 服务，并把工具操作透明转发到 Roblox 官方 MCP。 */
export function createRemoteServer(options: RemoteServerOptions): RemoteServer {
  // OAuth router, host/origin checks, bearer verification, StreamableHTTPServerTransport sessions.
}
```

Register handlers with `ListToolsRequestSchema` and `CallToolRequestSchema` instead of fixed SDK tool helpers so tool definitions can refresh dynamically.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/remote-server.test.ts && npm run typecheck`
Expected: authenticated initialization, dynamic list and forwarding pass.

```powershell
git add src/remote-server.ts src/index.ts tests/remote-server.test.ts
git commit -m "feat: proxy Roblox MCP over authenticated HTTP"
```

### Task 7: Compose runtime, diagnostics and graceful shutdown

**Files:**
- Create: `src/doctor.ts`
- Create: `tests/doctor.test.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing doctor tests**

```ts
expect(await runDoctor({ fileExists, createClient })).toEqual(expect.objectContaining({
  mcpBat: { ok: true },
  handshake: { ok: true },
  tools: { ok: true, count: 28 },
  studios: { ok: false, message: expect.stringContaining('Studio') },
}));
```

Test missing batch file, failed handshake, empty studios and one connected Studio separately.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/doctor.test.ts`
Expected: FAIL because `runDoctor` does not exist.

- [ ] **Step 3: Implement doctor and runtime composition**

`doctor.ts` prints a compact pass/fail table and exits nonzero only when the gateway cannot start; an empty Studio list is an actionable warning. `index.ts` reads configuration, connects Roblox, starts HTTP, handles `SIGINT`/`SIGTERM`, closes HTTP sessions before the Roblox child, and never starts twice.

```ts
/** 按依赖顺序启动网关，并在退出时关闭网页会话和 Roblox 官方 MCP 子进程。 */
export async function main(): Promise<void> { /* compose lifecycle */ }
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/doctor.test.ts && npm run typecheck && npm run build`
Expected: doctor tests pass and distributable JavaScript builds.

```powershell
git add src/doctor.ts src/index.ts tests/doctor.test.ts package.json
git commit -m "feat: add gateway runtime diagnostics"
```

### Task 8: Add the Windows one-command launcher

**Files:**
- Create: `scripts/start.ps1`
- Create: `scripts/lib.ps1`
- Create: `tests/start-script.test.ts`
- Modify: `.gitignore`
- Modify: `.env.example`

- [ ] **Step 1: Write a failing static launcher test**

```ts
const script = await readFile('scripts/start.ps1', 'utf8');
expect(script).toContain('cloudflared');
expect(script).toContain('PUBLIC_BASE_URL');
expect(script).toContain('MCP_AUTH_PASSWORD');
expect(script).toContain('npm start');
expect(script).not.toMatch(/MCP_AUTH_PASSWORD\s*=\s*['"][^$]/);
```

Add tests for `scripts/lib.ps1` parsing a TryCloudflare URL and writing only ignored `.env.local`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/start-script.test.ts`
Expected: FAIL because the scripts do not exist.

- [ ] **Step 3: Implement the launcher**

The launcher performs these exact stages: verify Node and Roblox `mcp.bat`; download the official Windows AMD64 `cloudflared.exe` to ignored `.tools/` when absent; generate cryptographically random local secrets; start Quick Tunnel; parse the HTTPS URL; write `.env.local`; run `npm run doctor`; start the gateway; display MCP URL and OAuth password; stop child processes on Ctrl+C.

Use native PowerShell cmdlets, resolved literal paths, hidden background windows, and no recursive deletion. Do not print the token-signing secret.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/start-script.test.ts`
Expected: launcher safety and parsing tests pass.

```powershell
git add scripts/start.ps1 scripts/lib.ps1 tests/start-script.test.ts .gitignore .env.example
git commit -m "feat: add Windows quick-start launcher"
```

### Task 9: Write Chinese user documentation and code comments

**Files:**
- Create: `README.md`
- Create: `docs/教程.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Modify: all `src/*.ts` files where public lifecycle functions lack responsibility comments

- [ ] **Step 1: Write a documentation checklist test**

```ts
for (const phrase of [
  '启用 Studio 作为 MCP 服务器',
  'ChatGPT Developer Mode',
  'OAuth',
  'Cloudflare',
  'list_roblox_studios',
  '停止服务',
  '故障排查',
]) expect(readme + tutorial).toContain(phrase);
```

Assert documentation never instructs installation of a third-party Studio plugin or use of port 58741.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/documentation.test.ts`
Expected: FAIL because the documentation files do not exist.

- [ ] **Step 3: Write the documentation**

README sections: purpose, architecture, security warning, prerequisites, ten-minute quick start, ChatGPT App fields, first read test, first write test, stopping, upgrade, links to full guide.

`docs/教程.md` sections: Studio built-in MCP enablement, screenshots described in text, cloning/installing, launcher output, Developer Mode creation, OAuth, multi-Studio `studio_id`, safe write approvals, permanent named tunnel option, common errors, logs and cleanup.

Use concise Chinese comments before exported functions/classes to explain their complete responsibility. Do not comment obvious assignments or repeat type names.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/documentation.test.ts && npm run typecheck`
Expected: documentation checklist and typecheck pass.

```powershell
git add README.md docs/教程.md LICENSE SECURITY.md src tests/documentation.test.ts
git commit -m "docs: add Chinese setup and troubleshooting guide"
```

### Task 10: Full verification, live Studio smoke test and private GitHub publication

**Files:**
- Modify only files required by failures proven during this task.

- [ ] **Step 1: Run the complete automated verification**

Run:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all tests pass, typecheck/build exit 0, and no whitespace errors.

- [ ] **Step 2: Run local built-in MCP smoke tests**

Enable Roblox Studio Assistant → Manage MCP Servers → Enable Studio as an MCP server. Then run:

```powershell
npm run doctor
```

Expected: batch file, handshake, tools and Studio instance checks all pass; at least one `studio_id` is shown.

- [ ] **Step 3: Run the HTTPS/OAuth smoke test**

Start `scripts/start.ps1`, create or reconnect the ChatGPT custom App to the emitted `/mcp` URL, approve OAuth once, call `list_roblox_studios`, then call one official read tool against the selected `studio_id`. Confirm no request reaches ports 58741 or 3002.

- [ ] **Step 4: Audit repository contents**

Run:

```powershell
git status --short
git ls-files | Select-String -Pattern '\.env\.local|cloudflared\.exe|node_modules|logs/'
```

Expected: working tree clean; the secret/binary search has no output.

- [ ] **Step 5: Create the private GitHub repository and push**

Install or authenticate GitHub CLI only after the user completes any required browser login. Then run:

```powershell
gh repo create "网页直连roblox-mcp" --private --source . --remote origin --push
gh repo view --json nameWithOwner,visibility,url
```

Expected: visibility is `PRIVATE`, the main branch is pushed, and the returned URL opens the new repository.

- [ ] **Step 6: Record final verification**

If smoke testing required a code fix, follow TDD for that failure and commit only the proven fix. Finish with a concise report containing test counts, Studio tool count, connected Studio count, public MCP status, repository URL and any temporary-tunnel limitation.
