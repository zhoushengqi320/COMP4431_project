# 样本修订与首轮试跑准备记录

日期：2026-11-03。当前版本：v5。当前没有训练任务、没有微调模型。

## 复核范围

程序做了全量来源版本、课程编号、结构和质量规则检查；AI 对本地快照中的核心课程示例进行了来源对照与改写。没有声称逐条人工读完全部样本，也没有声称外部官方课程事实均已核实。review.json 的 approved 仅表示通过这些规则、可供有限试跑，不是人工金标准。人工批准数为 0。

AI 对照的核心示例包括 DSAI2201、COMP4431、COMP4432、DSAI4203、COMP5541、AMA4680、COMP2011、COMP2014、AMA1110、DSAI4208。先修关系重点核对了 DSAI2201 的三组“以及”条件、COMP2011 的先修与排除课程、AMA1110 的无先修与排除列表，以及 COMP4432 的建议背景描述。

## 修改

- 简介改为目标、内容和学习方式的短说明，避免直接粘贴多页大纲。
- 学习收获改为完整表达，过滤超长条目；不为凑条数凭空补技能。
- 先修原文不经过术语替换，保留“或／以及／排除”等关系。
- 同名课程分组去重后再构造推荐，避免清单被重复内容占满；这不意味着官方课程等价或互认。
- 扩展推荐问法、候选课程窗口和继续推荐场景。
- 源描述术语存在疑点、学习收获不足或仍不合格的样本被隔离。

## 可复现的规则检查比较

| 版本 | 样本总数 | 被相同最终规则标记的样本 |
| --- | ---: | ---: |
| v3 | 1502 | 1009 |
| v5 | 1550 | 47 |

这只是构造规则触发数。两个版本样本数量不同，规则也不是语义裁判；不能把这个下降称为模型准确率提高或人工质量合格率。没有进行任何微调前后模型对比。

## 试跑候选包

| 集合 | 草稿总数 | 规则通过候选 | 隔离 |
| --- | ---: | ---: | ---: |
| train | 1199 | 1168 | 31 |
| validation | 163 | 160 | 3 |
| test | 188 | 175 | 13 |

本地 reviewed-release 仅含训练和验证文件；175 条独立测试候选从原 test 集合与 review.json 关联读取，绝不作为训练数据上传。47 条问题样本详见 EXCLUDED.md，部分样本同时触发多条规则。

训练候选任务分布：

```json
{
  "unknown_semester": 270,
  "course_introduction": 267,
  "learning_goals": 267,
  "prerequisite_explanation": 266,
  "unknown_eligibility": 6,
  "recommendation": 38,
  "continue_recommendation": 29,
  "compare_courses": 16,
  "unknown_rating": 1,
  "unknown_course": 5,
  "empty_retrieval": 1,
  "resist_fabrication": 1,
  "no_more_matches": 1
}
```

## 云端准备与费用

- 已用现有 Key 只读查询调优任务列表，HTTP 200。这不保证创建任务和部署权限已验证。
- 首次历史上传接口因描述参数被拒绝，没有上传成功；随后改用官方推荐的兼容 File 接口，两份文件上传成功。
- 两份远端文件均重新查询为 processed，字节数与本地包一致。独立测试集没有上传。
- 已准备 training-request.proposed.json，但从未提交创建训练任务接口。
- 拟用 qwen3-8b、efficient_sft，1 轮，batch_size 32、max_length 8192，关闭混合训练。学习率等使用平台默认。
- 本地训练 token 估算 2,269,388，1 轮约 ¥13.62，3 轮约 ¥40.85。不是最终平台报价，不含部署／调用等费用。
- 建议首轮训练预算上限 ¥20，尚未获得用户批准；只有平台预估在批准范围内才可开训，超出或无法核实需先澄清。

## 验证

46 项软件测试通过；结构检查 1,550 条无错误；生产构建通过。评测脚本只做不联网演练，实际付费评测没有执行。当前应用模型和 .env 配置未切换，仍为原模型。

官方参考：

- [调优任务 API](https://help.aliyun.com/zh/model-studio/create-fine-tuning-job-api)
- [文件上传与存储不收费、文件查询方式](https://help.aliyun.com/zh/model-studio/openai-file-interface)
- [训练价格与公式](https://help.aliyun.com/zh/model-studio/model-training-overview)
