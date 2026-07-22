# CodeBuddy CN 管家

CodeBuddy CN 管家是一款专用于 **CodeBuddy CN** 的本地桌面账号管理工具，基于 Tauri、React 和 Rust 构建。

当前版本已经移除原项目的多平台界面与无关联网行为，只保留 CodeBuddy CN 的账号管理、账号刷新、切换账号、实例、唤醒和验证功能。

## 功能范围

- CodeBuddy CN OAuth 登录
- CodeBuddy CN 多账号管理
- 账号用量与状态刷新
- 切换当前 CodeBuddy CN 账号
- 标签、筛选和批量操作
- CodeBuddy CN 实例管理
- 唤醒任务与验证
- CodeBuddy CN 账号 JSON 导入与导出

不提供其他 AI 平台的账号管理入口。

## 账号 JSON 导入与导出

导入和导出只处理 **CodeBuddy CN 账号数据**：

- 导出结果为 JSON 文件
- JSON 中不包含应用设置
- 不导出实例设置、唤醒设置或其他配置
- 不读取或修改其他平台的账号
- 导入时拒绝识别为其他平台的旧版账号 JSON
- 可以使用本工具导出的 JSON 恢复 CodeBuddy CN 账号

账号页工具栏和“设置 > 数据管理”中的导入、导出均遵循以上范围。

请妥善保管导出的 JSON。账号数据可能包含可用于恢复登录状态的敏感凭据，不应上传到公共网盘、代码仓库或发送给不可信人员。

## 联网范围

应用只保留以下 CodeBuddy CN 功能所需的联网请求：

- 登录与授权
- 账号令牌和状态刷新
- CodeBuddy CN 相关账号操作
- 实例、唤醒和验证功能所需请求

以下联网能力已关闭：

- 其他平台的登录、令牌续期和配额刷新
- 自动更新检查与更新下载
- 广告、公告、赞助内容和远程配置
- WebDAV 同步
- WebSocket 服务和网页查询服务
- Codex 本地访问网关
- 全平台后台自动导入轮询

后台令牌续期和托盘“刷新配额”也只会处理 CodeBuddy CN。

## 界面说明

当前界面仅保留以下主要入口：

1. CodeBuddy CN 账号
2. 实例
3. 唤醒
4. 验证
5. 数据管理

侧边栏固定展开，不提供隐藏或折叠按钮。

## 数据与隐私

- 账号和应用数据保存在本机应用数据目录中。
- 应用不会通过自建云服务同步账号列表。
- JSON 导入和导出在本机完成。
- 除 CodeBuddy CN 必需功能外，不主动连接更新、广告、公告、赞助、远程配置或其他平台服务。
- 启动 CodeBuddy CN 客户端或实例后，客户端自身产生的网络请求由 CodeBuddy CN 客户端负责，不属于本工具的后台联网功能。

建议：

1. 不要把账号 JSON 提交到 Git。
2. 不要在公共电脑上长期保留账号数据。
3. 分享日志或截图前检查是否包含账号、令牌或本机路径。
4. 定期删除不再使用的账号备份。

## 支持平台

项目使用 Tauri 构建，可生成 Windows、macOS 和 Linux 桌面安装包。实际使用前，需要确认对应系统已安装或能够运行 CodeBuddy CN 客户端。

## 开发与构建

### 环境要求

- Node.js 18 或更高版本
- npm 9 或更高版本
- Rust 工具链
- Tauri 2 所需的系统依赖

### 安装依赖

```bash
npm install
```

### 前端开发

```bash
npm run dev
```

### 桌面开发模式

```bash
npm run tauri dev
```

### 类型检查

```bash
npm run typecheck
```

### 前端生产构建

```bash
npm run build
```

### 桌面安装包构建

```bash
npm run tauri build
```

### Rust 检查

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## 技术栈

- React 19
- TypeScript
- Vite
- Tauri 2
- Rust
- Zustand
- i18next

## 项目来源

本项目由 Cockpit Tools 精简和定制而来，保留并感谢原项目及其贡献者的工作。当前分支的产品范围已经调整为仅服务 CodeBuddy CN，原项目中其他平台的说明不再适用于本版本。

## 许可证

本项目沿用仓库现有的 **CC BY-NC-SA 4.0** 许可约定。使用、修改或分发前，请确认符合仓库许可证及相关第三方组件的许可要求。

## 免责声明

本项目仅用于个人学习、研究和合法的账号管理场景。使用者应自行遵守 CodeBuddy CN 服务条款及所在地法律法规，并承担使用、账号备份和凭据保管产生的风险。
