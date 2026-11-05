<HTML>
   <h1>不要删除Readme文件！！</h1>
</HTML>
# PolyPath — PolyU academic planning advisor

A red-and-white React app for the COMP4431 chatbot project. Students chat with an AI advisor about courses, prerequisites and remaining-semester plans. Two screens: **AI Advisor** and **My Profile & Documents**.

Replies come from **Qwen** (`qwen-plus`) on Alibaba Cloud Model Studio. They are grounded in the team’s PolyU **course catalogue** (Supabase `public.courses`, 2659 rows), not from a fine-tuned model.
<HTML>
   <h2>
      推荐通过版本管理工具安装 **Node.js LTS（长期支持版）及其随附的 npm**，方便以后切换项目所需版本。已有项目应优先使用项目指定的 Node.js 版本。[npm 官方安装建议](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/)

| 系统 | 推荐工具 | 使用的终端 |
|---|---|---|
| macOS | nvm | 系统“终端”，默认 zsh |
| Windows | NVM for Windows v2 社区版 | PowerShell |

两个系统的版本管理工具是不同项目，安装命令不能混用。

1. **macOS：安装 Node.js 和 npm**

   打开“终端”。如果尚未安装 nvm，执行：

   ```bash
   # 确保 zsh 配置文件存在
   touch ~/.zshrc

   # 安装 nvm，并将初始化配置写入 zsh 配置文件
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | PROFILE="$HOME/.zshrc" bash

   # 让当前终端加载配置
   source ~/.zshrc

   # 确认 nvm 已可用
   command -v nvm
   ```

   最后一条命令应输出 `nvm`。随后安装并启用 Node.js LTS：

   ```bash
   nvm install --lts
   nvm use --lts

   # 将当前版本设为新终端的默认版本
   nvm alias default "$(node -v)"

   node -v
   npm -v
   ```

   `node -v` 和 `npm -v` 都显示版本号，说明安装成功。

   使用 nvm 时，不需要通过 `sudo npm install -g` 安装全局工具，也不要在个人 `.npmrc` 中自定义 `prefix`，否则可能与 nvm 冲突。[nvm 官方说明](https://github.com/nvm-sh/nvm)

2. **Windows：安装 Node.js 和 npm**

   打开 [NVM for Windows 官方发布页](https://github.com/nvm-windows/nvm/releases/latest)，下载当前稳定版社区安装程序：

   - 常见 Intel、AMD 电脑选择 `x64-setup.exe`。
   - Windows ARM 电脑选择 `arm64-setup.exe`。

   **v2 社区版应以普通用户身份运行安装程序**，按向导完成配置。安装过程中可能单独出现权限提示，但无需将整个安装程序或日常 PowerShell 都设为管理员运行。[官方安装说明](https://docs.nvm-windows.com/install/installers/)

   如果已经独立安装过 Node.js，先记录已有版本及全局工具，并备份个人 `.npmrc`；安装向导若检测到旧版本，应阅读迁移提示，避免旧 Node.js 路径与新环境冲突。

   安装完成后，关闭并重新打开 PowerShell，执行：

   ```powershell
   # 检查 NVM 环境
   nvm env

   # 安装并启用长期支持版 Node.js
   nvm install lts
   nvm use lts

   # 检查 Node.js 和 npm
   node -v
   npm -v
   ```

   注意：Windows 使用 `nvm install lts`，macOS 使用 `nvm install --lts`。[Windows 命令说明](https://docs.nvm-windows.com/command/nvm/use/lts/)

3. **两个系统通用：配置 npm 下载源**

   默认推荐 npm 官方源。在终端或 PowerShell 中执行：

   ```bash
   npm config set registry=https://registry.npmjs.org/ --location=user
   ```

   `--location=user` 表示保存为当前用户的配置。查看实际使用的源和配置文件位置：

   ```bash
   npm config get registry
   npm config get userconfig
   ```

   用户配置文件通常位于：

   | 系统 | 默认位置 |
   |---|---|
   | macOS | `~/.npmrc` |
   | Windows | `%USERPROFILE%\.npmrc` |

   项目根目录也可以有 `.npmrc`，其配置可以覆盖用户配置。因此，在某个项目中发现源设置没有生效时，还要检查项目自身的配置。[npm 配置文件说明](https://docs.npmjs.com/cli/v11/configuring-npm/npmrc/)

   如果官方源下载较慢，可以先在一次安装中试用 npmmirror：

   ```bash
   npm install --registry=https://registry.npmmirror.com/
   ```

   确认适合自己的网络后，再考虑长期设置：

   ```bash
   npm config set registry=https://registry.npmmirror.com/ --location=user
   ```

   要恢复官方源，重新执行本步骤开头的命令即可。npmmirror 是第三方只读镜像，发布 npm 包时应使用官方源。[镜像站说明](https://npmmirror.com/)

4. **验证配置是否成功**

   macOS 和 Windows 均执行：

   ```bash
   node -v
   npm -v
   npm config get registry
   npm ping
   ```

   验收标准：

   - Node.js 和 npm 均能输出版本号。
   - `registry` 显示你选择的下载源。
   - `npm ping` 返回 `PONG`，说明当前源可以访问。[npm ping 说明](https://docs.npmjs.com/cli/v11/commands/npm-ping/)

   这些命令验证基础环境；项目是否能够正常运行，还需要在项目目录完成依赖安装和启动验证。

5. **项目中的日常使用**

   创建一个新项目时，可以执行：

   ```bash
   mkdir npm-demo
   cd npm-demo
   npm init -y
   ```

   `npm init -y` 会生成 `package.json`，用于记录项目资料、依赖和脚本。

   日常依赖管理遵循以下约定：

   | 场景 | 命令或操作 |
   |---|---|
   | 安装项目依赖 | `npm install` |
   | 添加某个依赖 | `npm install 包名`，将“包名”替换为实际名称 |
   | 按已有锁文件重新安装 | `npm ci` |
   | 团队协作 | 将 `package.json` 和 `package-lock.json` 一起提交 |

   `npm ci` 要求已经存在与 `package.json` 一致的锁文件；它会先移除现有 `node_modules`，再按照锁文件安装，不会自动更新锁文件。[npm ci 说明](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
   </h2>
</HTML>
## Run

Need Node.js 22.12+ (or 24 LTS).

```sh
npm install
cp .env.example .env
```
<HTML>
   <h2 style="color: red;">
  下面是配置.env文件的方法
</h2>
</HTML>
Edit `.env` (never commit this file):

```dotenv
VITE_ADVISOR_API_URL=/api/advisor
QWEN_API_KEY=sk-ws-H.YDYYDDY.ZhvV.MEUCIQCgg74njGDhTdqns95Z2P6d2crmH7AikQ259vz_V0tKxgIgbi7TCE9Tp_C5A_GoJr7PkaMtj1EqFmB9dTZOnsOOZE0
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
QWEN_ASR_MODEL=qwen3-asr-flash
SUPABASE_URL=https://fmumzuwcuysvrxzamdre.supabase.co
SUPABASE_ANON_KEY=sb_publishable_ZBbmS-VaXfXqxIQb39h2Ug_YJ8LrvGH
```
<HTML>
   <h2>
      下面是配置.env.local的方法
   </h2>
</HTML>
Edit `.env.local` (never commit this file):

```dotenv
# Local deployment selection; credentials remain in .env.
QWEN_MODEL=qwen3-8b-01fa13690bf1
VITE_ADVISOR_API_URL=/api/advisor
# Full advisor: system prompt, course retrieval and course-card formatting.
QWEN_ADVISOR_MODE=integrated
```
Then:

```sh
npm run dev
```

Open http://127.0.0.1:5173/. Stop with Ctrl+C. After changing `.env`, restart Vite.

Leave `VITE_ADVISOR_API_URL` empty to run the labelled UI demo with no Qwen calls.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Production bundle |
| `npm run preview` | Serve the production build |
| `npm test` | Voice, speech and catalogue unit tests |
| `npm run sync:courses` | Refresh `data/courses.json` from Supabase |
| `npm run export:preview` | Build a click-to-open `dist/PolyPath-preview.html` |

## How answers are produced

The browser never sees the Qwen or Supabase keys. Vite proxies two local endpoints:

1. **Chat** — `POST /api/advisor`  
   Retrieve matching rows from the course catalogue, attach them to the prompt, call `qwen-plus`. Qwen may only recommend courses that appear in those excerpts. It must not invent codes.

2. **Voice** — `POST /api/transcribe`  
   The mic records in the browser (`MediaRecorder`). On stop, the clip is sent to **Qwen-ASR** (`qwen3-asr-flash`). The transcript is placed in the input box for review; it is not sent to the advisor until the student clicks Send.

The catalogue snapshot lives in `data/courses.json`. If `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, the server also reloads live rows (and falls back to the snapshot if Supabase is down). This is retrieval-augmented generation, not training a new Qwen checkpoint.

Call-level request/response details: [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).

## What the UI does

- Chat with Enter to send / Shift+Enter for a newline, follow-up chips and New chat.
- Profile fields persist in `localStorage`. Documents and attachments stay in memory for the session.
- Course cards, semester plans, planning checks and source citations are rendered from the advisor JSON.
- Voice input: Mandarin / Cantonese / English, then Qwen transcription.
- Read aloud uses the browser speech synthesizer; it is separate from Qwen.

## Project layout

### 2D / 3D avatar integration

Pear is the small floating silver-and-glass companion above the chat composer.
Open it to switch between
an animated SVG character and an interactive procedural Three.js model. It follows
chat, recording, transcription and read-aloud states, with reduced-motion support
and an automatic 2D fallback if WebGL fails. No additional avatar service is needed.
Run normally with `npm install` and `npm run dev`.

Implementation details, controls, limitations and demo steps:
[docs/AVATAR_FEATURE.md](docs/AVATAR_FEATURE.md).

```text
src/main.jsx                 Screens and interactive components
src/styles.css               Visual system
src/advisor.js               Browser → /api/advisor and /api/transcribe
src/voice.js                 Microphone recording
src/speech.js                Read-aloud
server/qwen-advisor.mjs      Qwen chat + ASR proxy
server/course-knowledge.mjs  Catalogue load, search and prompt excerpts
data/courses.json            Local snapshot of Supabase public.courses
docs/AI_INTEGRATION.md       Qwen and catalogue contract
tests/                       Node test runner
```

## Secrets and GitHub

Commit source and config: `src/`, `server/`, `data/courses.json`, `docs/`, `scripts/`, `tests/`, `index.html`, `package.json`, `.env.example`, README.

Do **not** commit `.env`, `node_modules/`, `dist/`, or API keys. The Qwen key, Supabase publishable key and any service-role key stay in `.env` only.

Frontend `VITE_*` values are public. Model credentials belong on the Vite server proxy, not in client code.

## Group members — complete before Canvas submission

| English name | Student ID | Contribution |
| --- | --- | --- |
| TODO | TODO | Frontend / UI |
| TODO | TODO | AI / backend |

This repository is the working source. Presentation slides and the final Canvas package are separate.
