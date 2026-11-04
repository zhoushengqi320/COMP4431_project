# PolyPath 微调准备：当前 v5

当前阶段：首轮试跑候选包已经生成并上传到百炼，但**没有创建训练任务、没有产生微调模型、没有批准付费预算**。当前网页仍使用原来的模型。

## 当前文件

| 文件 | 用途 |
| --- | --- |
| `v5/reviewed-release/train.jsonl` | 1,168 条首轮训练候选 |
| `v5/reviewed-release/validation.jsonl` | 160 条验证候选 |
| `v5/drafts/test.jsonl` + `v5/review.json` | 188 条独立测试草稿中选用规则通过的 175 条；不上传训练 |
| `v5/REVIEW_RESULT.md` | 修改、复核范围、数据分布、费用与云端准备记录 |
| `v5/REVIEW_PREVIEW.md` | 可读样例 |
| `v5/EXCLUDED.md` | 47 条隔离样本及原因 |
| `v5/review-summary.json` | 检查范围、各集合计数 |
| `v5/reviewed-release/token-estimate.json` | 仅针对试跑训练包的 token 与费用估算 |
| `v5/cloud-upload-compatible.json` | 两份已上传文件与 processed 状态、字节数验证 |
| `v5/training-request.proposed.json` | 已填入真实文件 ID、尚未提交的训练请求 |
| `training-plan.json` | 首轮训练方案与预算未批准状态 |

## 如何理解“已检查”

review.json 的 approved 表示通过来源版本、课程编号、结构和质量规则，作为有限试跑候选；reviewType 明确为 automated_source_and_quality_check。它不等于人工金标准，也不代表全部回答已逐字验证。人工批准数仍为 0。AI 对核心示例做过来源对照与改写，仍建议用户查看样例和报告。

源数据为原有课程快照的 COMP、DSAI、AMA 共 354 门课程。按同名、同描述或高相似课程分组后划分训练／验证／测试集合，保持来源课程隔离。分组是词面启发式，不能保证消除所有语义重复；不同集合共享任务模板，不能把结果宣传成完全未知任务上的泛化能力。

简介、目标和建议问题仍有模板化特征，任务分布也不完全均衡。只适合先做 1 轮小规模试验，再看原始模型输出是否改善；不保证训练一定有提升。随机示例评分不进入训练目标，先修原文保留“或／以及／排除”关系。

## 本轮改动

- 用短说明替代大段课程大纲，减少截断和学习收获主题碎片。
- 保留完整先修条件，不对其中的课程名做术语替换。
- 增加兴趣推荐与继续推荐情形，每轮最多 3 门，并保留更多课程的候选编号。
- 同名课程组去重，避免重复内容占满推荐；不表示官方学分互认。
- 隔离存在源描述疑点、学习收获不足等问题的 47 条样本。

相同最终规则对 v3 标记 1,009/1,502 条，对 v5 标记 47/1,550 条。这是构造规则触发数量，两个版本样本数量不同，且规则不是语义裁判；**不是模型准确率或人工质量合格率**。

## 本地工具

在含 package.json 的项目目录运行：

```powershell
npm run finetune:validate
npm run finetune:evaluate -- --model qwen3-8b --limit 10
```

评测默认不联网。只有显式加 --run 才会调用模型并产生可能的调用费；实际评测会读取审核通过的独立测试候选，直接评分模型原始回复，不经过后端修正。检查的是 JSON、课程数量、编号来源、长度和重复等规则，不是全文事实准确率。

生成新版本时指定新目录，已有内容和审核不会被覆盖：

```powershell
npm run finetune:prepare -- finetuning/v6
npm run finetune:review -- finetuning/v6
npm run finetune:export -- finetuning/v6
```

review 命令只做自动化来源与质量规则检查，输出中明确不包含人工语义批准。export 仅导出通过记录的训练与验证文件，不导出 test 作为训练数据。新版本改变 current.json 指向，已有云端文件不会被替换或再次自动上传。

公开 tokenizer 估算工具只下载分词文件，不下载模型权重、不上传课程数据：

```powershell
.\.venv-finetuning\Scripts\python.exe scripts/estimate-finetuning-tokens.py finetuning/v5/reviewed-release
```

Python 依赖位于本地虚拟环境，复制项目时无需携带。重建时安装 tokenizers 即可。JS 生成和检查工具使用项目原有 Node 依赖。

## 云端和下一步预算

- 当前 API Key 的北京地域调优任务列表查询返回 200；这不证明创建任务与部署权限均已验证。
- 两份训练／验证文件已通过兼容 File 接口上传，并查询为 processed，字节数匹配本地。独立测试集保留本地。
- 训练请求拟用 qwen3-8b、efficient_sft（LoRA）、1 轮、batch_size 32、max_length 8192，关闭混合训练。学习率与其余 LoRA 参数省略，使用平台默认；是否接受仍以平台为准。
- 本地估算训练包 2,269,388 token，按 2026-11-03 官方单价 ¥0.006/千 token，1 轮约 ¥13.62，3 轮约 ¥40.85。通用 ChatML 分词可能与平台计费实现不同，不是最终报价。
- 建议首轮训练费上限 ¥20，目前未获批准。只有实际平台预估在批准范围内才可启动；超过或无法核实应先澄清。部署、模型调用等费用另行确认。
- 不会自动部署，不会提前切换网页的模型。

文件上传、存储和查询不收费；本轮没有执行训练或模型推理。

官方参考：

- [训练参数与训练任务 API](https://help.aliyun.com/zh/model-studio/create-fine-tuning-job-api)
- [模型调优与训练价格](https://help.aliyun.com/zh/model-studio/model-training-overview)
- [文件上传、状态查询与费用](https://help.aliyun.com/zh/model-studio/openai-file-interface)

## 后续公平评估

使用同一基础模型 qwen3-8b 的微调前后版本、相同提示词、相同课程上下文和推理设置，比较原始回复。现有 qwen-plus 只能作为额外业务参照，不将不同基础模型的差异全部归因于微调。训练后保存真实任务 ID、数据版本、参数、训练和验证曲线、用时、实际 token 与费用，再做独立测试。本目录没有虚构训练曲线或提升数据。

## 验证与历史版本

46 项软件测试通过，结构检查覆盖 1,550 条样本且无错误，项目构建通过。评测工具只做了不联网演练。

v1-v4 为历史构造版本；v1 曾发现跨集合重复，v3/v4 用于改写与质量比较。当前只使用 current.json 指向的 v5。历史准备说明保存在 v3/PREPARATION_README.md，不能当作当前状态。
