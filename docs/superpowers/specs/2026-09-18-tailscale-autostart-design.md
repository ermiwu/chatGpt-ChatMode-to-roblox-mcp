# Tailscale 固定地址与 Windows 自动启动设计

## 目标

让 ChatGPT 自定义 MCP App 永久使用同一个 HTTPS 地址，无需在每次启动后重新创建或修改 App。Windows 用户登录后自动启动本地网关；Tailscale 系统服务负责恢复公网 Funnel。

固定 MCP 地址为：

```text
https://pc-20260330fkzg.tail391bca.ts.net/mcp
```

## 已建立的外部基础

- Tailscale 1.102.4 已安装为自动启动的 Windows 服务。
- 当前设备已加入用户的 tailnet。
- Funnel 已获准并在后台将公网 HTTPS 转发至 `http://127.0.0.1:58742`。
- Tailscale 提供并管理 `pc-20260330fkzg.tail391bca.ts.net` 的 DNS 与 TLS 证书。

## 方案

### 固定运行配置

`.env.local` 中的 `PUBLIC_BASE_URL` 与 `ALLOWED_ORIGINS` 改为固定的 Tailscale HTTPS 根地址。现有 OAuth 批准密码和令牌签名密钥继续使用，不在终端、日志或 Git 中输出。

### 固定模式启动脚本

新增 `scripts/start-fixed.ps1`，职责为：

1. 验证 Node.js、Tailscale、Roblox 官方 `mcp.bat` 与 `.env.local`。
2. 验证 Tailscale 已登录，并确保 Funnel 指向 `127.0.0.1:58742`。
3. 构建项目并运行诊断。
4. 启动网关，将输出追加到 Git 忽略的日志目录。
5. 网关异常退出时以有限延迟重新启动；收到停止信号时正常结束。

现有 `scripts/start.ps1` 保留为 Quick Tunnel 临时测试入口，不承担固定模式自动启动。

### Windows 登录计划任务

新增 `scripts/install-autostart.ps1` 和 `scripts/uninstall-autostart.ps1`：

- 安装脚本注册名为 `WebToRobloxMcp` 的当前用户登录任务。
- 任务使用项目绝对路径调用 `start-fixed.ps1`。
- 同一任务只允许一个实例，失败后由任务计划程序重试。
- 卸载脚本只删除这个精确名称的任务，不删除项目、日志或 Tailscale。
- 安装完成后立即启动任务，以便当场验证。

## OAuth 生命周期

ChatGPT App 始终使用固定 URL，因此 App 本身只需创建一次。网关继续使用固定 `MCP_TOKEN_SECRET`，未过期访问令牌可跨进程验证。当前 OAuth 客户端注册与刷新令牌仍在进程内存中；网关重启后 ChatGPT 可能要求重新批准，但不需要删除、重建或修改 App。

本轮不新增 OAuth 数据库，避免把长期刷新令牌写入磁盘。若将来明确需要“重启后绝不重新批准”，再单独设计加密持久化。

## 错误处理

- Tailscale 未登录：脚本退出并提示重新登录。
- Funnel 配置失败：脚本不启动网关，避免显示错误的公网状态。
- Studio 未打开：诊断记录警告；自动任务保持运行，让用户打开 Studio 后通过官方 MCP 重试。
- 网关崩溃：固定脚本延迟后重启，避免高频循环。
- 端口占用：记录明确错误，不终止未知进程。

## 测试与验收

- 静态测试确保脚本只使用固定 `.env.local`，不生成 Quick Tunnel 或泄露密钥。
- PowerShell 5 解析器验证所有脚本语法。
- 完整 Jest、类型检查和构建通过。
- 计划任务存在、触发器为当前用户登录、动作为项目固定脚本。
- `tailscale funnel status` 显示固定公网地址与 `127.0.0.1:58742` 映射。
- 从固定 HTTPS 地址完成 OAuth、`tools/list` 和 `list_roblox_studios` 实测。
- Git 审计确认 `.env.local`、日志、Tailscale 状态及任何凭据均未被跟踪。

## 安全边界

- 网关继续只监听 `127.0.0.1`。
- Funnel 仅暴露该 HTTP 服务，不开放 Roblox、文件共享或远程桌面端口。
- 所有 MCP 请求仍需 OAuth Bearer 令牌。
- 自动任务不以 SYSTEM 身份运行，避免脱离当前用户的 Roblox Studio 会话。
