# PolyPath — PolyU Academic Advisor

COMP4431 Artificial Intelligence (2026/27) 的领域聊天机器人项目。应用领域是 **PolyU Computing 学业规划／选课咨询**，支持课程内容、先修条件、学习方向和上传资料问答。

## 小组信息（提交前填写）

班别：`[TO FILL: Thursday / Friday]`。按项目要求由 2–4 名成员组成小组，并如实记录各人的贡献。

| English name | Student ID | Actual contribution |
| --- | --- | --- |
| [TO FILL] | [TO FILL] | [TO FILL] |
| [TO FILL] | [TO FILL] | [TO FILL] |

有 3–4 名成员时增加对应行。不得使用虚构身份。项目改动提交到 `shengqi` 分支，不直接提交到 `main`。按用户要求，本次不准备 PPT、演示稿或演示流程。

## 快速运行

需要 **Node.js 24 或更新版本**和 npm（数据库使用 Node 内置 SQLite）。

```sh
npm ci
cp .env.example .env
npm run dev
```

打开终端显示的地址（通常为 `http://127.0.0.1:5173`；端口占用时 Vite 会选择下一个）。默认直接进入访客工作区，可以先进行文字课程问答，无需注册。右上角 **Sign in** 打开登录页；新用户可选择 **Create account** 注册，也可以选择 **Continue as guest** 返回访客工作区。没有预设账户或通用密码。开发服务同时提供前端、登录、文档解析和顾问 API。

浏览器有有效登录会话时会恢复会员工作区、账号资料和已保存的聊天记录。右上角 **Account** 可查看账户及学业资料；**Sign out** 退出后返回访客工作区，会员聊天仍保留在该账号中。首页的三个快捷问题会先填入输入框，检查后再发送。**New conversation** 新建聊天，之前的聊天保留在左侧 **Recent chats**，可随时切换。

生产方式：

```sh
npm run build
npm start
```

默认运行在 `http://127.0.0.1:3000`，可以配置 `HOST` 和 `PORT`。运行服务会读取根目录 `.env`，已有环境变量优先。请勿直接双击 `dist/index.html` 或使用纯静态托管，这些方式无法提供后端登录和问答功能。

## 访客与登录后的功能

| 功能 | 访客 | 登录用户 |
| --- | --- | --- |
| 文字课程问答、上下文追问 | 知识库回答；同一网络连接来源每 15 分钟最多 20 次请求 | 使用服务端配置的知识库或模型模式 |
| 学业资料、文件上传与文档问答 | 需登录 | 可用 |
| 语音输入、朗读及声音设置 | 界面引导登录后使用 | 浏览器支持时可用 |
| 已配置的大模型 | 不调用模型，即使服务器配置了密钥 | 配置有效时可用 |
| 聊天记录 | 当前标签页的 `sessionStorage`；刷新可恢复，关闭标签页后不再保留 | SQLite 按账号保存，刷新或重新登录后恢复 |

访客限额由服务端按实际连接对端地址计算，不采用浏览器提供的转发地址；同一代理或共享网络下可能共用额度。超限返回 `429` 和 `Retry-After`，可以等待额度重置或登录。访客提交文件或非空学业资料会被服务端拒绝。语音功能由界面限制，浏览器识别后的文字仍属于普通文字输入。

## Supabase 连接准备

可在本地 `.env` 设置 `SUPABASE_URL` 和 `SUPABASE_PUBLISHABLE_KEY`（也接受 `SUPABASE_ANON_KEY`），运行 `npm run check:supabase` 只读检查连接及邮箱确认设置。连接层位于 `server/supabase-client.mjs`，仅供服务端使用；用户数据请求通过用户 JWT 和 RLS 进行授权，不使用管理员 key 绕过访问策略。

**当前运行时仍使用 SQLite，尚未启用 Supabase 数据读取。** 已收到并检查现有表结构和 RLS 策略，但只读数据映射尚未实现。按用户要求，对 Supabase 只允许读取，不修改数据、表结构或权限，也不创建云端账户、会话或迁移本地数据；账户、学业资料和聊天记录继续保存在本地。`scripts/inspect-supabase-schema.sql` 可用于只读检查表字段、约束和访问策略，不读取用户行。实际 URL、key 和用户提供的结构导出文件不进入 Git 或源码包。

## 两种问答模式

### Knowledge assistant：无需密钥

默认 `/api/advisor` 使用 **TF-IDF 特征、余弦相似度、中英文主题扩展和课程代码匹配**组织回答。访客只检索内置课程资料；登录用户还可检索上传文档。它不是随机示例或统一模板回复，也不伪装成大模型。

资料库目前包含 9 门 PolyU Computing 课程与 3 项指导资料；每项保留官方来源、原始版本和核查日期。可询问 `COMP4431 的先修课程是什么？`、`Recommend courses for machine learning`，或围绕上一轮课程继续提问。库外课程与无法确定的毕业资格会明确说明证据不足。

### AI advisor：检索支持的大模型

在 `.env` 中设置以下配置，或通过已有环境变量提供密钥：

```dotenv
VITE_ADVISOR_API_URL=/api/advisor
DEEPSEEK_API_KEY=replace_with_your_server_side_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

重启服务后，登录用户即可使用该模式；访客始终使用知识库回答。前端 `VITE_` 配置变化后需重新构建；服务端密钥和模型配置不进入前端。`DEEPSEEK_API_KEY` **不能加 `VITE_` 前缀**，不得放进截图、提交包或 Git。

该模式先检索相关证据，再将问题、最近对话、学业资料和相关文档节选发送给配置的模型服务。输出经过类型检查；引用 ID 必须来自实际检索结果，已收录课程的名称和学分由资料核对。模型调用失败会明确报错，不会悄悄切换模式。模型配置成功不等于答案完全准确，仍需核对适用入学年级的官方资料。

界面会显示当前模式；模型密钥有效性必须通过实际请求确认。模型名称和接口细节以 [DeepSeek 官方文档](https://api-docs.deepseek.com/) 为准。

## 已实现功能

- **响应式界面**：默认访客入口、独立登录／注册页、课程探索入口、聊天历史与来源面板、账户资料和文件区、移动端导航。
- **账户系统与历史**：邮箱注册、登录、退出、会话恢复，按用户保存学业资料及聊天；多标签页切换账户时校验当前身份，避免旧页面覆盖新账户。新建聊天不会删除历史。
- **语音输入**：登录后使用浏览器语音识别，支持英语、普通话和粤语选项；需主动开启麦克风，先检查识别文字再发送。
- **语音朗读**：登录后读取回答、课程建议和检查项；提供声音／语速设置、暂停、继续和停止。
- **文档问答**：登录后支持 PDF、DOCX、TXT、CSV、Markdown。真实提取文字、分块检索并标明上传资料来源；示例非个人资料位于 `examples/student-notes.txt`。
- **来源与边界**：官方资料链接、版本日期、用户文件标记、未知课程提示、缺失证据和解析失败提示。
- **可复现验证**：认证、课程检索、文件解析、模型接口、生产服务与语音状态测试；独立的领域问答评估。

## 架构与技术实现

```text
React UI / Recent chats / member-only browser speech
        |
        | guest marker OR session cookie + expected account ID
        v
Node HTTP API (Vite development / standalone production)
        |
        +-- Guest: per-peer quota -> text-only corpus retrieval
        |
        +-- Member: authenticate and pin account identity
                |
                +-- SQLite: account, password/session hashes, profile, chats
                +-- PDF / DOCX / text extraction with resource limits
                +-- Revalidate session after uploads/extraction
                +-- Corpus + document retrieval -> local or configured LLM answer

Browser sessionStorage: guest chats + account-scoped unsynced chat drafts
```

- `server/auth.mjs`：密码使用随机盐与 scrypt；会话令牌随机生成，数据库仅保存令牌哈希，通过 HttpOnly / SameSite Cookie 传递。默认 7 天，“Keep me signed in”为 30 天。登录／注册限流，同源校验，资料与聊天按账号隔离；聊天保存检查版本，防止其他标签页的新记录被旧状态覆盖。
- `server/advisor-access.mjs`：Vite 与生产服务共用访客／会员权限规则、访客限流和模式选择；会员上传解析后再次校验登录状态，失效请求不会降级访客或调用模型。
- `src/useConversations.js`、`src/conversations.js`：聊天列表、切换、新建和保存队列；访客记录保存在当前标签页，会员未同步对话按账号缓存，保存失败或版本冲突会提示处理。
- `server/knowledge.mjs`：课程代码精确约束、中英文术语扩展、TF-IDF 向量与余弦排序、上下文课程指代。资料与算法见 `knowledge/README.md`。
- `server/documents.mjs`：PDF.js 提取 PDF 文本，Mammoth 提取 DOCX；二进制解析在有时间与内存限制的 worker 中运行，失败文件不影响其他可读文件。
- `server/deepseek-advisor.mjs` 与 `prompts/advisor-system.txt`：检索增强提示词、模型超时、结构检查、来源白名单与错误处理。
- `src/voice.js`、`src/speech.js`：浏览器语音状态机，处理取消、晚到事件、分段朗读和权限错误。
- `server/index.mjs`：构建产物服务、有限访客问答及需认证的账号 API；拒绝越界静态路径。Vite 也显式禁止下载数据库及 WAL/SHM 文件。

本项目没有宣称微调 LLM、使用向量数据库或实现 2D/3D Avatar。规范将这些列为可选附加功能例子，并不要求全部实现。

## 数据与限制

- 账户、保存的学业资料及会员聊天记录存于 `data/polypath.sqlite`；可设置 `AUTH_DATABASE_PATH`。此目录不会加入源码包。备份前停止服务，再备份整个数据目录。
- 会员历史按账号隔离，刷新或重新登录后恢复。每个账号最多保存 50 条对话，每条最多 100 条消息（包含用户和助手消息），保存后的单条对话上限 256 KiB。达到限制时界面会提示；新建聊天保留此前历史，不会静默清空旧聊天。
- 访客历史仅存于当前标签页的 `sessionStorage`，刷新后可恢复，关闭标签页后不再保留；不会自动上传或合并到登录账号。未同步的会员对话草稿也使用当前标签页的 `sessionStorage`，按账号分开保存。保存失败或冲突时应按提示重试／保存副本，关闭标签页可能丢失尚未同步的内容。
- 文件原件和解析全文不会写入账户数据库；刷新页面后必须重新附加文件，已保存聊天不能自动恢复原文件。已经写入回答或来源说明的文件节选会随会员聊天记录保存。
- 前端最多选择 8 个文件，总计 24 MiB，每个 10 MiB；后端整个 multipart 请求上限 25 MiB。
- 每个 PDF 最多处理 40 页，每文件最多 60,000 字符，合计 120,000 字符。超限和截断会提示；扫描图片、加密 PDF 和 XLSX 不支持。OCR 未实现。
- 已提取文本仍可能受到版式、表格顺序与字符编码影响。上传的成绩单／笔记不会自动证明已通过课程或官方学分。
- 课程库是小型有日期的快照，不是完整或实时课程目录；其中 COMP4432 公开来源为 2021 年版本，回答会提示核对更新。
- 可以解释先修依赖，不能自动确认学期供应、名额、正式选课资格或毕业资格。
- 浏览器语音可用性、实际声音和权限依设备而异；语音服务可能联网。普通文本聊天始终保留。
- 暂无邮箱验证、密码重置、邮件发送、第三方登录或账户管理后台。

通过 HTTPS 对外部署时设置 `AUTH_SECURE_COOKIES=true`，并将 `AUTH_ORIGIN` 设为实际来源，例如 `https://polypath.example.com`（不含尾部斜杠）。反向代理需将页面与 `/api/` 转发至同一服务。默认仅监听本机；需要其他机器访问才设置 `HOST=0.0.0.0`。

## 检查与打包

```sh
npm test
npm run evaluate
npm run build
npm run package
```

评估结果写入 `artifacts/evaluation.json`，解释见 `docs/EVALUATION.md`。评估衡量所列本地检索用例，不能推导在线模型正确率、用户满意度或实际语音识别率。

`npm run package` 生成 `deliverables/PolyPath-source.zip`，包含源码、锁文件、提示词、知识库、测试和说明；排除 `.env`、数据库、node_modules、Git 状态和构建产物。打包不执行 Git 提交或远程上传。

课程要求逐项对照及尚需用户补充的成员资料，见 `docs/REQUIREMENTS.md`。演示材料由用户另行准备。
