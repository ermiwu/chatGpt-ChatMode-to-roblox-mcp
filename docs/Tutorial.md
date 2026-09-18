# Web-to-Roblox MCP: Complete Setup Guide

This project connects a custom ChatGPT web MCP App to Roblox Studio's built-in MCP server. ChatGPT cannot reach a local stdio process directly, so the gateway provides OAuth authorization, translates Streamable HTTP to stdio, and publishes the loopback service through a Cloudflare HTTPS tunnel.

No third-party Roblox Studio extension is required.

## 1. Enable Roblox Studio's built-in MCP server

1. Update Roblox Studio and sign in.
2. Open the Place you want ChatGPT to access.
3. Open the Assistant MCP management screen.
4. Enable **Studio as an MCP server**.
5. Keep Studio and the Place open while using the gateway.

The exact labels may change between Studio releases. The important results are that Studio allows official MCP access and `%LOCALAPPDATA%\Roblox\mcp.bat` exists.

## 2. Clone and install the project

```powershell
git clone <your-private-repository-url>
Set-Location '网页直连roblox mcp'
npm install
```

You can verify the local Studio connection before creating a public tunnel:

```powershell
npm run build
npm run doctor
```

The four checks cover the official launcher, MCP handshake, tool catalog, and active Studio sessions. If the final check fails, confirm that a Place is open and the built-in MCP switch is enabled.

## 3. Start the HTTPS gateway

Run this command from the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

The launcher will:

1. Verify Node.js and Roblox's official `mcp.bat`.
2. Download the official Cloudflare `cloudflared.exe` into `.tools/`.
3. Build the TypeScript project and create a Quick Tunnel.
4. Generate a random OAuth approval password and token-signing secret.
5. Write runtime configuration only to the Git-ignored `.env.local` file.
6. Run diagnostics and start the gateway.

Keep this PowerShell window open. Copy the displayed **ChatGPT MCP URL** and **OAuth approval password**. Never share the token secret stored in `.env.local`.

## 4. Create the custom App in ChatGPT

1. Open ChatGPT settings, go to **Security & Login**, and enable Developer Mode.
2. Open `chatgpt.com/plugins` and create a custom App.
3. Use a name such as **Web to Roblox MCP**.
4. Paste the complete URL ending in `/mcp` into the MCP Server URL field.
5. Select OAuth authentication, save, and connect.

The UI labels may evolve. Look for the MCP server URL and OAuth authentication fields in ChatGPT Developer Mode.

## 5. Approve OAuth access

ChatGPT opens the gateway's authorization page when it connects. The page shows the requesting client, redirect URI, and requested scopes.

1. Confirm that the page belongs to the `trycloudflare.com` hostname printed by your launcher.
2. Enter the OAuth approval password from the terminal.
3. Click **Approve** once and wait for the browser to return to ChatGPT.

Authorization requests are short-lived and single-use. If an old page reports `authorization request is invalid or expired`, return to ChatGPT and start a new connection instead of approving the old page again.

## 6. Test read operations

Start with this request:

> Call `list_roblox_studios` and list the active Studio sessions without changing anything.

If more than one Studio is listed, copy the correct `studio_id` and explicitly require all later calls to use it. Next, try a read-only tool such as `get_studio_state` or `search_game_tree`.

## 7. Test write operations safely

The official MCP may expose write-capable tools such as `execute_luau` and `multi_edit`. Use this sequence for the first write:

1. Save or version the Place in Studio.
2. Ask ChatGPT to state the tool name, target, and arguments before calling it.
3. Make a small, reversible change, such as creating a temporary Folder.
4. Inspect the result in Studio before continuing.
5. Undo the change or remove the temporary object.

The gateway discovers tools dynamically from Roblox. Unknown tools are conservatively marked as potentially mutating.

## 8. Use a permanent hostname

Quick Tunnel URLs change after every restart. For regular use, create a Cloudflare Zero Trust Named Tunnel and route an HTTPS hostname to `http://127.0.0.1:58742`. Then create `.env.local` yourself:

```dotenv
PUBLIC_BASE_URL=https://your-fixed-hostname.example
REMOTE_HOST=127.0.0.1
REMOTE_PORT=58742
MCP_AUTH_PASSWORD=a-long-random-password
MCP_TOKEN_SECRET=at-least-32-random-characters
ALLOWED_ORIGINS=https://your-fixed-hostname.example
```

Run `npm run build`, `npm run doctor`, and `npm start`, then configure the fixed URL ending in `/mcp` in ChatGPT. Never commit the Named Tunnel credentials.

## 9. Stop and clean up

Press `Ctrl+C` in the launcher window to stop both the local gateway and Cloudflare tunnel. The project does not install a background service or startup task.

`.env.local`, `.tools/`, and `logs/` are ignored by Git. If you no longer need them, move those specific files or folders to the Recycle Bin. There is no Studio extension to uninstall.

## Stable Tailscale Funnel URL and Windows autostart

You do not need to buy a domain. Every user signs in to their own Tailscale account and receives their own stable public `*.ts.net` HTTPS hostname; never copy another user's hostname.

Install the official Tailscale Windows client, sign in, and approve the current computer. Then run:

```powershell
tailscale funnel --bg --yes http://127.0.0.1:58742
tailscale funnel status
```

The first command may print an approval URL. Open it, enable Funnel, and run the command again. The output will show your own fixed address, such as `https://your-computer.your-tailnet.ts.net`.

Copy `.env.example` to `.env.local`. Set `PUBLIC_BASE_URL` and `ALLOWED_ORIGINS` to your fixed HTTPS origin, choose a random OAuth approval password, and choose a separate signing secret of at least 32 characters. Keep the gateway on `127.0.0.1:58742` and never commit `.env.local`.

Install the current-user logon task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

The task invokes `scripts/start-fixed.ps1`. It validates Tailscale and the Funnel route, builds the project, runs diagnostics, starts the gateway, and performs bounded restarts after crashes. Logs are written to `logs/fixed-gateway.log`.

Remove only the project task with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1
```

Configure the ChatGPT App once with the stable URL ending in `/mcp`. A gateway restart can invalidate in-memory OAuth client or refresh state; if authorization fails, approve OAuth again in the existing App instead of recreating it. Roblox Studio must still be open with the target Place and its built-in MCP server enabled.

## 10. Troubleshooting

### Built-in Roblox MCP not found

Update Roblox Studio, launch it at least once, and check `%LOCALAPPDATA%\Roblox\mcp.bat`. For a nonstandard installation, set `ROBLOX_MCP_COMMAND` in `.env.local`.

### No Roblox Studio session found

Open a specific Place and enable the official MCP server in Studio's Assistant MCP management screen. Run `npm run doctor` again. This issue is local to Studio and is unrelated to Cloudflare.

### ChatGPT sees the App, but tools time out

Make sure the launcher terminal is still running. Open the public `/health` endpoint and inspect `connected`, `studioConnected`, and `toolCount`. Check `logs/cloudflared.log` for tunnel errors.

### Approve appeared to do nothing, then the request expired

The old approval was consumed or expired. Remove or reconnect the failed App connection in ChatGPT, approve the newly generated request once, and allow the browser to follow the redirect back to ChatGPT.

### `401 unauthorized`

Tokens may become invalid when the gateway restarts. Reconnect the App and complete OAuth again. Tokens issued for another tunnel URL cannot be reused.

### `403 Host/Origin is not allowed`

The tunnel hostname does not match `PUBLIC_BASE_URL` or `ALLOWED_ORIGINS`. For a Quick Tunnel, restart the launcher and update the App with the newly printed MCP URL. For a fixed hostname, correct `.env.local`.

### Logs and safe bug reports

- Gateway output: the launcher PowerShell window.
- Tunnel output: `logs/cloudflared.log`.
- Studio output: Studio's Output and MCP management panels.

Before sharing a report, remove OAuth passwords, access and refresh tokens, token-signing secrets, and Cloudflare credentials. See [SECURITY.md](../SECURITY.md) for the reporting policy.
