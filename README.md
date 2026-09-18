# 网页直连 Roblox MCP

把 ChatGPT 网页版的自定义 MCP App 安全地连接到 Roblox Studio 自带的 MCP。Studio 端不需要额外扩展：网关直接启动 Roblox 安装目录中的 `mcp.bat`，动态转发官方工具，包括读取与写入操作。

> 安全提示：官方工具可以执行 Luau、修改脚本和实例。只在自己的电脑上运行；不要公开 OAuth 批准密码、`.env.local` 或长期隧道凭据；写操作前先核对 ChatGPT 显示的工具名称与参数。

## 工作方式

```text
ChatGPT 网页版
  │ HTTPS + OAuth 2.1/PKCE
  ▼
Tailscale Funnel ──► 本机网关 127.0.0.1:58742
                         │ stdio
                         ▼
                    Roblox 自带 MCP ──► Roblox Studio
```

项目不会模拟 Roblox 工具，也不维护一份容易过期的工具清单。每次连接都会读取官方 MCP 当前公开的工具并保留其读写提示。

## 前置条件

- Windows 10/11。
- Node.js 20 或更高版本。
- 最新版 Roblox Studio，并已登录。
- ChatGPT 账号可使用 Developer Mode 和自定义 MCP App。
- 首次启动时能访问 GitHub，以下载 Cloudflare 官方 `cloudflared.exe`。

## 十分钟快速开始

1. 打开 Roblox Studio 和目标项目。在 Studio 的 Assistant / MCP 设置中“启用 Studio 作为 MCP 服务器”。保持 Studio 开启。
2. 在 PowerShell 进入项目目录，然后运行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
   ```

3. 等待自检出现四个勾。终端会显示：
   - `ChatGPT MCP URL`：填入网页 App 的 MCP 地址。
   - `OAuth approval password`：稍后在授权页输入，只输入一次。
4. 打开 ChatGPT Developer Mode，在 `chatgpt.com/plugins` 创建 App；名称可填“网页直连 Roblox MCP”，MCP URL 填终端给出的 `https://...trycloudflare.com/mcp`，认证选择 OAuth。
5. 连接时浏览器会打开本项目的 OAuth 页面。核对 App 和回调地址，输入终端中的批准密码并点击一次批准。
6. 让 ChatGPT 调用 `list_roblox_studios`。若返回多个 Studio，记下目标的 `studio_id`，后续调用都明确传入它。
7. 第一次读取建议使用 `get_studio_state` 或 `search_game_tree`。第一次写入建议做一个可立即撤销的小改动，并先检查参数。

Quick Tunnel 每次启动的公网地址都会变化；重启后需要更新 App 的 MCP URL。完整步骤、长期固定地址和故障排查见 [中文教程](docs/教程.md)；English instructions are available in the [English Tutorial](docs/Tutorial.md).

## 固定地址与登录自动启动

已有 Tailscale Funnel 的电脑可以永久使用同一个 `*.ts.net` 固定地址。配置好 `.env.local` 后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

计划任务会在当前用户登录时调用 `scripts/start-fixed.ps1`，验证 Funnel、构建并启动网关。ChatGPT App 永久填写固定地址末尾的 `/mcp`，不需要重新创建。网关重启后旧的 OAuth 客户端或刷新令牌可能失效，此时只需在原 App 中重新批准，不要删除 App。

移除自动启动但保留项目、Tailscale 和日志：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1
```

Roblox Studio 和目标项目仍必须打开，并保持官方 MCP 开关启用。`scripts/start.ps1` 继续作为 Cloudflare Quick Tunnel 临时测试入口。

## 常用命令

```powershell
npm install          # 安装依赖
npm run build        # 编译 TypeScript
npm run doctor       # 检查官方 MCP 与 Studio
npm test             # 运行测试
npm run typecheck    # 类型检查
```

## 停止服务

在启动脚本窗口按 `Ctrl+C`。脚本会停止本地网关与 Cloudflare 隧道。若强制关闭终端，可在任务管理器结束遗留的 `cloudflared.exe`；项目不会把服务安装为开机启动项。

## 更新

拉取新版本后执行 `npm install` 和 `npm run build`。`cloudflared` 位于被忽略的 `.tools/`；需要更新时可先将该单个文件移到回收站，再重新运行启动脚本。

## 隐私与许可证

OAuth 客户端、授权码和刷新令牌只保存在当前进程内存中。签名密钥只保存在本机 `.env.local`。详细报告方式见 [SECURITY.md](SECURITY.md)。代码采用 [MIT License](LICENSE)。
