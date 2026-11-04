# v8 模型部署与项目接入

用户于 2026-11-04 指示“部署”。百炼服务已返回 **RUNNING**，三项真实生产处理程序测试及一次实际 Vite 聊天接口验证通过。项目已通过 `.env.local` 切换到部署调用编号，页面地址为 http://127.0.0.1:5173/ 。最新状态见 [部署状态](../../finetuning/v8/deployment-status.json)。

| 项目 | 值 |
| --- | --- |
| 原训练任务 | ft-202611040019-7fc7 |
| 原训练产出模型 | qwen3-8b-ft-202611040019-7fc7 |
| 实际部署调用编号 | qwen3-8b-01fa13690bf1 |
| 基础模型 | qwen3-8b |
| 部署方式 | lora，capacity=1 |
| 地域 | 华北 2（北京） |
| API | https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions |
| 非思考模式价格 | 每百万输入 Token 0.5 元，输出 Token 2 元 |
| 闲置计费 | 不使用不计费 |

价格于 2026-11-04 核对 [百炼 Token 按量部署文档](https://help.aliyun.com/zh/model-studio/model-deployment-token)，模型部署接口和调用方式依据 [API 部署指南](https://help.aliyun.com/zh/model-studio/model-deployment-quick-start/)。实际账单以平台为准。未购买按时长收费的专属算力，未重新训练模型。

训练产出模型编号和部署调用编号不同，应用应使用后者。调用需要拥有该部署的北京业务空间 API Key；模型编号本身不代替账号权限。

## 接入与验证记录

- [部署提交回执](../../finetuning/v8/deployment-submission.json)：创建前先记录请求，防止不确定响应导致重复部署。
- [部署状态历史](../../finetuning/v8/deployment-status-history.jsonl)：保存服务就绪前后的观察记录。
- 项目构建已通过。`.env.example` 已补齐，同步部署调用编号及语音模型配置。
- 已使用生产 `/api/advisor` 处理程序验证课程介绍、机器学习推荐、继续推荐三个场景，保留原始模型输出和服务端整理后的答案，避免把页面格式保证误当作模型原生能力。
- 验证文件为 `docs/evaluations/deployment-v8-smoke.json`：记录 HTTP 状态、耗时、实际调用／返回模型、输入输出 token、格式检查和估算调用费用。

连通和格式验证通过不代表已完成独立测试集评估，也不代表所有课程事实正确。完整微调前后对比需要后续另行执行。

## 日常运行

在项目目录运行 `npm run dev`，默认打开 http://127.0.0.1:5173/ 。当前模型选择保存在 `.env.local`，API Key 保存在 `.env`；`.env.local` 的同名变量优先于 `.env`。更换模型时修改 `.env.local`，然后重启服务。API Key 只放在 `.env`，不放入前端变量或展示资料。

重新查询已创建服务：`node scripts/check-deployment.mjs`。该命令只查询状态，不会重复创建资源。LoRA Token 按量部署一个月不使用会自动释放，恢复使用时先查询现有状态，避免重复创建。

## 已通过的实际检查

| 场景 | HTTP | 展示课程 |
| --- | ---: | --- |
| 请问COMP4431是什么课？ | 200 | COMP4431 |
| 我想学machine learning相关内容，给我推荐一些课 | 200 | COMP4432、DSAI4203、AMA4680 |
| 请继续推荐更多相关课程，避开之前介绍过的课程。 | 200 | AMA573、AP40012、AP40013 |
| 实际运行页面的聊天接口：DSAI2201 介绍 | 200 | DSAI2201 |

前三次上游回复均为可解析 JSON，各课程条目最后字段均为 preparation；整理后的页面答案每次最多三门，包含继续提问，继续推荐没有重复此前课程。前两次推荐之间的课程相关性仍需要独立语义评价，格式检查不代替内容正确性评估。

前三次请求共记录输入 18,801 tokens、输出 2,193 tokens，按已核对单价估算 0.0137865 元。额外一次实际页面路由检查耗时约 6.23 秒；该路由没有把上游 usage 暴露给前端，因此这次调用没有计入前三次的估算金额。所有费用均未核对最终账单。

原始模型调用耗时约 3.96 秒、12.92 秒、11.14 秒。记录的是当前共享 LoRA 部署的三次观察，不代表稳定延迟或服务承诺。项目启动与路由检查见 [接入记录](../../finetuning/v8/deployment-integration.json)。
