# 网页直连 Roblox 内置 MCP 设计

## 目标

创建一个全新的 Windows 项目，让 ChatGPT 网页版通过自定义 MCP App 安全访问本机 Roblox Studio 自带的 MCP 服务。项目不依赖第三方 Studio 插件，不使用旧版 `58741` 插件轮询协议，并提供完整中文教程与必要的中文源码注释。

## 已验证前提

- Windows 上 Roblox 官方入口为 `%LOCALAPPDATA%\Roblox\mcp.bat`。
- 使用 MCP TypeScript SDK 的 `StdioClientTransport` 可以成功启动该入口并完成 MCP 握手。
- 实机探测读取到 28 个官方工具，其中包含 `list_roblox_studios`。
- 当前 Studio 返回空实例列表时，网关应报告“Studio 未启用内置 MCP 或尚未注册”，而不是伪装成工具调用成功。

## 总体架构

数据链路如下：

`ChatGPT 网页 → 公网 HTTPS → OAuth 网关 → MCP stdio 客户端 → Roblox StudioMCP.exe → Roblox Studio`

网关同时承担两个角色：

1. 面向 ChatGPT 时，它是支持 Streamable HTTP 的远程 MCP 服务器。
2. 面向 Roblox 时，它是通过 stdio 连接官方 MCP 的本地 MCP 客户端。

网关在启动时连接官方 MCP，并动态读取工具定义。ChatGPT 请求工具列表时，网关返回官方工具定义；调用工具时，网关将名称和参数原样转交官方 MCP，再将内容、结构化结果和错误转换为远程 MCP 响应。

## 组件划分

### 配置模块

读取并验证监听地址、公网 HTTPS 地址、OAuth 密码、令牌签名密钥、Roblox MCP 启动命令与允许来源。远程监听必须绑定环回地址，密钥不得进入 Git。

### Roblox 内置 MCP 客户端

负责解析默认 Windows 启动路径、启动 `cmd.exe /c %LOCALAPPDATA%\Roblox\mcp.bat`、完成握手、读取工具列表、转发工具调用、监控子进程退出并执行有限次数重连。该组件不理解具体 Roblox 工具业务，避免官方工具变化时需要同步维护固定映射。

### 动态 MCP 代理

为每个远程会话创建协议服务器，并根据官方 `tools/list` 结果注册工具。工具描述、输入模式和工具注解尽量原样保留。所有调用共享一个受控的 Roblox 客户端连接，并串行化连接恢复，防止多个网页会话同时重复启动官方进程。

### OAuth 与 HTTP 服务

提供受 PKCE 保护的单用户 OAuth、动态客户端注册、受保护资源元数据和 Streamable HTTP `/mcp` 端点。OAuth 密码只在本机配置中保存；访问令牌短期有效，并绑定到精确的 MCP 资源 URL。

### 启动器与状态检查

提供一个 PowerShell 启动脚本，自动生成本机密钥、启动 Cloudflare Quick Tunnel、读取临时 HTTPS 地址、启动网关并显示 ChatGPT 配置地址。另提供 `doctor` 命令，检查 Roblox Studio、`mcp.bat`、官方 MCP 握手、Studio 实例、隧道和 OAuth 元数据。

## 生命周期与数据流

1. 用户在 Roblox Studio 的 Assistant 设置中启用“Studio 作为 MCP 服务器”。
2. 本地启动器创建或读取 `.env.local`，启动 HTTPS 隧道和网关。
3. 网关启动 Roblox 官方 MCP 子进程并缓存当前工具目录。
4. ChatGPT 通过 OAuth 获得访问令牌并建立 Streamable HTTP 会话。
5. ChatGPT 获取工具列表；网关返回官方工具目录。
6. ChatGPT 调用工具；网关通过 stdio 转发并返回官方结果。
7. 官方 MCP 退出时，当前调用收到明确错误；下一次调用触发一次受控重连和工具目录刷新。
8. 网关退出时关闭远程会话、撤销内存令牌并终止自己启动的官方 MCP 子进程。

## 多 Studio 实例

网关不自行猜测目标项目。它保留官方 `studio_id` 参数和 `list_roblox_studios` 工具。教程要求先列出 Studio 实例，再在后续调用中传入目标 `studio_id`。只有一个实例时仍由官方 MCP 的既有行为处理。

## 错误处理

- 找不到 `mcp.bat`：启动失败，并提示安装或更新 Roblox Studio。
- 官方 MCP 无法握手：返回本地诊断信息，不启动公网工具服务。
- Studio 实例为空：工具仍可列出，但状态接口明确显示 `studioConnected: false`。
- 官方子进程中途退出：将待处理调用失败为可读错误，清理旧连接并允许下一次调用重连。
- 工具目录变化：重连后重新读取，不继续使用旧模式。
- 隧道 URL 变化：启动器更新本机配置，并提示重新连接 ChatGPT App。
- OAuth 失败：不记录密码、授权码或令牌，只记录阶段、状态码和脱敏错误。

## 安全边界

- HTTP 服务只监听 `127.0.0.1`，公网访问必须经过 HTTPS 隧道。
- OAuth 强制 PKCE S256、精确回调地址和资源受众校验。
- `.env.local`、隧道程序、日志和运行时状态全部忽略提交。
- 工具注解原样传递；对缺少注解的官方工具保守标记为可能产生写操作。
- README 明确提示 Roblox MCP 能修改场景、脚本并执行 Luau，只能连接可信 ChatGPT 账号。
- 不把访问令牌转发给 Roblox 官方 MCP；两侧认证边界完全分离。

## 项目结构

- `src/config.ts`：环境变量与默认路径验证。
- `src/roblox-client.ts`：官方 stdio MCP 生命周期与调用接口。
- `src/tool-catalog.ts`：官方工具定义规范化与刷新。
- `src/oauth-store.ts`：单用户 OAuth 状态和短期令牌。
- `src/oauth-routes.ts`：OAuth 与元数据路由。
- `src/remote-server.ts`：受保护的 Streamable HTTP MCP 服务。
- `src/doctor.ts`：本机环境和 Studio 连接诊断。
- `src/index.ts`：组合生命周期与优雅退出。
- `scripts/start.ps1`：Windows 一键启动与隧道编排。
- `tests/`：组件、OAuth、代理和进程恢复测试。
- `README.md`：快速开始。
- `docs/教程.md`：完整中文教程和排错手册。

## 注释与文档规范

源码只在职责边界、生命周期、协议转换和安全判断处添加简洁中文注释。函数注释描述函数的完整职责，不为显而易见的赋值或分支逐行注释。README 提供十分钟快速开始，完整教程解释 Studio 开关、Git 克隆、Node 安装、Cloudflare、ChatGPT Developer Mode、OAuth、读写测试、升级和停止服务。

## 测试策略

- 配置单元测试：缺失变量、非 HTTPS 地址、非环回监听和默认 `mcp.bat` 路径。
- 客户端单元测试：握手、工具列表、工具调用、子进程退出和单次重连。
- 代理测试：动态工具模式、内容转发、结构化结果、错误与会话关闭。
- OAuth 测试：发现、注册、PKCE、密码、回调 CSP、令牌交换和刷新。
- 集成测试：使用假的 stdio MCP 子进程完成 HTTP 初始化、工具列表和调用。
- 实机烟雾测试：调用官方 `list_roblox_studios`，并在 Studio 已启用时读取目标实例信息。

## 发布与 Git

项目使用独立、干净的 Git 历史，不复制旧仓库提交。首版定位为 Windows 本地自托管工具，仓库名为“网页直连roblox mcp”，GitHub 可见性为 Private。提交中不包含个人密钥、临时 Cloudflare URL、二进制隧道程序或原工作区的未完成文件。

## 完成标准

- 不安装第三方 Roblox 插件也能列出官方工具。
- Studio 启用内置 MCP 后，ChatGPT 能列出 Studio 实例并调用官方读取工具。
- 官方写工具可见，并由 ChatGPT 与工具注解共同触发审批提示。
- 一键启动能输出有效 HTTPS `/mcp` 地址和 OAuth 操作说明。
- 测试、类型检查、构建和公网 OAuth 烟雾测试全部通过。
- 新用户仅依赖 README 和中文教程即可完成安装、连接、验证与排错。
