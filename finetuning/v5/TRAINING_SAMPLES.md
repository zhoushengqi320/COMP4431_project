# 当前训练包：5 条真实样本预览

这些样本直接从 v5/reviewed-release/train.jsonl 提取，没有为了展示另外编写答案。训练包共 1,168 条。当前尚未开始训练。

每条样本包含：system（规则）、user（问题及课程资料）、assistant（期望模型生成的 JSON）。以下完整显示 user 和 assistant；共同 system 规则见文末。学院、学分、先修 Level 分组等页面字段由后端补充；随机示例评分不作为训练目标。

这些是模板／AI 辅助数据，经自动化来源和质量规则筛选；不是逐条人工认证的标准答案。

## train:course_introduction:DSAI2201

**学生问题**

请问DSAI2201是什么课？请用通俗语言介绍。

**期望 AI 返回的原始 JSON**

```json
{
  "text": "下面介绍DSAI2201。",
  "courses": [
    {
      "code": "DSAI2201",
      "learningOutcomes": [
        "根据问题选择合适的数据组织方式，例如保存一串数据、表示层级或连接关系。",
        "编写程序完成查找、排序等常见任务，并比较不同做法的效率。",
        "把较大的计算问题拆成小步骤，设计解决方案。",
        "通过书面分析和编程练习，把设计思路变成可以运行的程序。"
      ],
      "summary": "这门课教你怎样把数据放得有条理，以及怎样让程序更快地找到和处理数据。你会学习查找、排序、表示层级或连接关系等方法，也会比较不同做法的效率。课程结合讲课、辅导和上机练习：书面作业练习分析与设计，编程作业则让你把方法真正写成能运行的程序。"
    }
  ],
  "followUps": [
    "学习DSAI2201前可以怎样预习？",
    "DSAI2201的主要内容有哪些实际用途？",
    "DSAI2201的先修课程分别讲什么？"
  ]
}
```

**输入给模型的完整问题和课程资料**

```text
Student question:
请问DSAI2201是什么课？请用通俗语言介绍。

Student profile:
{}

PolyU course catalogue excerpts (answer using only these records):
DSAI2201 | Data Structures and Algorithms | 3 credits | Faculty of Engineering | dept dsai | level 2
Prerequisites (preserve AND/OR and required/recommended labels): 先修：COMP1011／COMP1012／ENG2002／LGT3109，以及 AMA1110／AMA1501／AMA2634，以及 AMA1751／AMA2111
Objectives: 向学生介绍数据结构和算法，并教授如何使用它们解决计算问题。
Description: 1. 算法分析 • 渐近符号。 • 效率分析。 2. 数据结构 • 线性结构：链表、栈、队列。 • 树结构：二叉树、平衡树、树遍历。 3. 搜索与排序 • 贪心排序算法：冒泡排序、插入排序、选择排序。 • 基于分治法的排序算法：快速排序和归并排序。 • 堆排序及相关数据结构：优先队列、堆。 • 哈希：哈希函数、冲突解决。 4. 图 • 定义与表示。 • 深度优先搜索和广度优先搜索。 5. 算法设计技术 • 贪心算法与动态规划。 • 分治法。 • 递归。 6. 应用 • 结合多种数据结构和算法进行实际程序开发。
Teaching: 课程内容将以大班讲座和小班监督辅导及实验室课程相结合的方式进行。讲座将提供必要的知识，而辅导和实验室课程则让学生有机会在编程中获得实际操作经验。课程将利用书面作业和编程作业。书面作业有助于学生培养分析和设计能力，而编程作业则强调实现能力。

Reference documents: none uploaded.
```

## train:prerequisite_explanation:DSAI2201

**学生问题**

DSAI2201需要什么先修基础？

**期望 AI 返回的原始 JSON**

```json
{
  "text": "下面介绍DSAI2201。",
  "courses": [
    {
      "code": "DSAI2201",
      "learningOutcomes": [
        "根据问题选择合适的数据组织方式，例如保存一串数据、表示层级或连接关系。",
        "编写程序完成查找、排序等常见任务，并比较不同做法的效率。",
        "把较大的计算问题拆成小步骤，设计解决方案。",
        "通过书面分析和编程练习，把设计思路变成可以运行的程序。"
      ],
      "summary": "课程库记载的先修信息：先修：COMP1011／COMP1012／ENG2002／LGT3109，以及 AMA1110／AMA1501／AMA2634，以及 AMA1751／AMA2111\n请以官方课程说明为准，不能仅凭课程编号判断是否符合选课要求。"
    }
  ],
  "followUps": [
    "学习DSAI2201前可以怎样预习？",
    "DSAI2201的主要内容有哪些实际用途？",
    "DSAI2201的先修课程分别讲什么？"
  ]
}
```

**输入给模型的完整问题和课程资料**

```text
Student question:
DSAI2201需要什么先修基础？

Student profile:
{}

PolyU course catalogue excerpts (answer using only these records):
DSAI2201 | Data Structures and Algorithms | 3 credits | Faculty of Engineering | dept dsai | level 2
Prerequisites (preserve AND/OR and required/recommended labels): 先修：COMP1011／COMP1012／ENG2002／LGT3109，以及 AMA1110／AMA1501／AMA2634，以及 AMA1751／AMA2111
Objectives: 向学生介绍数据结构和算法，并教授如何使用它们解决计算问题。
Description: 1. 算法分析 • 渐近符号。 • 效率分析。 2. 数据结构 • 线性结构：链表、栈、队列。 • 树结构：二叉树、平衡树、树遍历。 3. 搜索与排序 • 贪心排序算法：冒泡排序、插入排序、选择排序。 • 基于分治法的排序算法：快速排序和归并排序。 • 堆排序及相关数据结构：优先队列、堆。 • 哈希：哈希函数、冲突解决。 4. 图 • 定义与表示。 • 深度优先搜索和广度优先搜索。 5. 算法设计技术 • 贪心算法与动态规划。 • 分治法。 • 递归。 6. 应用 • 结合多种数据结构和算法进行实际程序开发。
Teaching: 课程内容将以大班讲座和小班监督辅导及实验室课程相结合的方式进行。讲座将提供必要的知识，而辅导和实验室课程则让学生有机会在编程中获得实际操作经验。课程将利用书面作业和编程作业。书面作业有助于学生培养分析和设计能力，而编程作业则强调实现能力。

Reference documents: none uploaded.
```

## train:recommendation:机器学习-0

**学生问题**

我想学机器学习相关内容，给我推荐一些课。

**期望 AI 返回的原始 JSON**

```json
{
  "text": "本次推荐COMP2014、AMA4680、COMP4432。",
  "overview": "围绕机器学习方向，可以先了解这3门课：COMP2014（Mathematics for Machine Learning），学习重点是提供机器学习所需的数学基本概念；AMA4680（Statistical Machine Learning），学习重点是提供机器学习的基本介绍；COMP4432（Machine Learning），学习重点是介绍现代机器学习的基本原理、概念和模型。下面逐门介绍，实际选课还需核对官方要求。",
  "courses": [
    {
      "code": "COMP2014",
      "learningOutcomes": [
        "用向量和矩阵表示数据或问题，并认识相关计算方法。",
        "了解逐步改进方案、寻找较好结果的数学思路。",
        "用概率和统计的基本概念理解数据分析问题。",
        "使用适当的数学软件和数值计算工具练习解决问题。"
      ],
      "summary": "这门课为机器学习打数学基础。你会学习怎样用向量和矩阵表示问题，怎样逐步改进一个方案，以及怎样用概率和统计分析数据。课程还介绍数学软件和数值计算工具，通过例子、辅导、实验和作业，把公式与实际问题联系起来。"
    },
    {
      "code": "AMA4680",
      "learningOutcomes": [
        "认识用于预测数值、判断类别和数据分组的常见方法。",
        "比较不同模型，并了解如何选择特征和评估模型。",
        "理解减少模型复杂度、避免过拟合的基本思路。",
        "结合计算机实验室的学习，将统计与机器学习方法用于实际问题。"
      ],
      "summary": "这门课从统计的角度介绍机器学习。你会学习预测数值、判断类别和给数据分组的方法，并比较模型、选择合适的特征，减少模型只记住训练数据的问题。课程在计算机实验室结合讲授和辅导，既解释方法为什么有效，也练习把方法用于实际问题。"
    },
    {
      "code": "COMP4432",
      "learningOutcomes": [
        "区分预测数值、判断类别和把相似数据分组等常见学习任务。",
        "认识不同机器学习方法的基本思路。",
        "通过模型评估了解方法是否可靠，并识别过拟合等问题。",
        "结合手写识别、物体识别和跟踪等例子，理解机器学习的实际用途。"
      ],
      "summary": "这门课介绍怎样让计算机从数据中学习规律，再用这些规律进行预测、分类或分组。你会接触常见的学习方法，并学习如何判断模型表现、发现过拟合等问题。课程还用手写数字识别、物体识别与跟踪等例子，说明机器学习怎样处理图像。教学结合讲授、案例讨论、习题和实验。"
    }
  ],
  "moreCourseCodes": [
    "COMP5541",
    "COMP5564",
    "DSAI5104"
  ],
  "followUps": [
    "这些机器学习课程各有什么侧重点？",
    "学习机器学习前应该怎样准备？",
    "COMP2014主要讲什么？"
  ]
}
```

**输入给模型的完整问题和课程资料**

```text
Student question:
我想学机器学习相关内容，给我推荐一些课。

Student profile:
{}

PolyU course catalogue excerpts (answer using only these records):
COMP2014 | Mathematics for Machine Learning | 3 credits | Faculty of Engineering | dept comp | level 2
Prerequisites (preserve AND/OR and required/recommended labels): 无
Objectives: • 提供机器学习所需的数学基本概念
• 通过使用合适的数值计算环境和数学软件库应用实际问题解决技能
Description: 课程时长 1. 数值计算软件：数学软件库（例如，Numpy、Pandas、Scikit-Learn）；数值计算环境（例如，Pytorch、Keras、Matlab） 2. 线性代数：向量空间；线性变换和矩阵；求解线性方程；矩阵分解；特征值和奇异值；矩阵范数和条件数；逆矩阵；列空间和零空间；非方阵作为不同维度之间的变换；伪逆 3. 优化：一维优化；最小二乘法；约束优化；凸优化；梯度下降；随机梯度下降 4. 概率与统计：概率的基本概念回顾；最大似然估计；贝叶斯规则；统计推断 5. 数学技能在机器学习中的应用：将数学技能与机器学习问题联系起来；数学技能在机器学习中的应用示例；与COMP中的机器学习课程的相关性
Teaching: 讲座为学生提供主题的主要概念，并通过全面的例子帮助理解。 辅导和实验课为学生提供实践技能的机会。 课程中的作业将用于发展理论技能和实践技能。

AMA4680 | Statistical Machine Learning | 3 credits | Faculty of Science | dept ama | level 4
Prerequisites (preserve AND/OR and required/recommended labels): 先修课程/金融分析应用线性模型（AMA2602）或应用线性模型（AMA3602）或数据科学统计（AMA3631）或同等课程和数据科学数学方法（AMA3001/AMA3701）或金融数学方法（AMA3723）或高等数学方法（AMA3724）或同等课程。排除统计机器学习（AMA3800）。
Objectives: 提供机器学习的基本介绍。介绍选定主题的机器学习基本概念和算法，为学生提供将机器学习应用于实际问题所需的基础知识，并为有兴趣从事机器学习或相关领域研究的学生提供起点。
Description: 监督学习、回归与模型选择：广义线性模型；岭回归、模型选择、降维、主成分分析、套索；再生核、核岭回归、正则化；随机梯度下降、在线学习。 监督学习、分类：朴素贝叶斯；决策树；K近邻分类器；逻辑回归；支持向量机、核化支持向量机；评分分类器，受试者操作特征曲线，AUC评分，不平衡数据。 无监督学习、聚类：K均值；凝聚层次聚类。 其他选修主题：交叉验证；人工神经网络、反向传播、深度学习算法简介；机器学习软件包简介；随机森林。
Teaching: 本课程主要通过计算机实验室的讲授和辅导进行。强调学习算法的理论背景及其实际应用。

COMP4432 | Machine Learning | 3 credits | Faculty of Engineering | dept comp | level 4
Prerequisites (preserve AND/OR and required/recommended labels): 无（但建议学生对入门级人工智能/数据挖掘概念有所了解，并熟悉线性代数和概率的基本概念）
Objectives: 1. 介绍现代机器学习的基本原理、概念和模型；
2. 介绍机器学习技术的最新进展及其在模式识别、计算机视觉等领域的应用。
Description: 课程内容 1. 第一部分：机器学习基础 • 线性代数和概率 • 数值计算和优化 • 学习任务：回归、分类等 • 性能问题：交叉验证、过拟合及维度灾难、偏差-方差困境等 2. 第二部分：模型和技术 • 监督学习： - 参数化方法 vs 非参数化方法 - 决策树基方法 - 贝叶斯模型 - 神经网络和支持向量机 - 高级模型：卷积神经网络 • 无监督学习： - k-均值和层次聚类 - 谱聚类和基于密度的聚类 - 高级模型：自动编码器、嵌入技术等 • 回归和提升 • 特征选择和降维 3. 第三部分：应用 • 手写识别挑战，例如 MNIST • 对象检测、识别和跟踪 - 对象特征描述：工程方法 vs 特征学习方法 - 对象检测示例，例如像素聚类用于人脸检测等 - 对象识别示例，例如通过主成分人脸特征进行人脸识别 - 对象跟踪示例，例如人体运动跟踪
Teaching: 39学时的课堂活动，包括主要概念和模型的讲授，以及应用案例研究、习题课、课堂/小组讨论、实验室作业和学生报告。根据需要，还将布置相关研究论文的阅读任务。

COMP5541 | Machine Learning and Data Analytics | 3 credits | Faculty of Engineering | dept comp | level 5
Prerequisites (preserve AND/OR and required/recommended labels): 无
Objectives: 1. 介绍现代机器学习的基本原理、概念和模型；
2. 培养数据分析技能，从数据中获取洞察。
Description: • 监督学习 定义、训练数据、输入空间维度、监督学习步骤、算法选择、偏差-方差困境、噪声、k-NN、线性判别分析、朴素贝叶斯、神经网络、深度学习模型、微调、评估指标。 • 无监督学习 数据类型、降维、特征选择、k-均值、混合模型、对比学习、异常检测、基于神经网络的方法、Hebbian学习、深度信念网络、自组织映射、潜在变量模型。 • 半监督学习 监督学习与未标记训练数据、连续性和流形假设、生成模型、启发式方法和低密度分离。 • 强化学习 定义、控制学习算法、最优性准则、价值函数、定向策略搜索、深度强化学习、学徒学习。 • 数据分析应用 利用机器学习在数据中发现数据类型和模式，选择性应用于主题建模、基因组学、预测等领域，涉及可扩展性、可解释性、法律/社会/伦理问题。
Teaching: 课堂讲授主要概念，结合全面示例，课堂问答帮助理解。 辅导和实验课帮助学生复习所学概念，掌握实用技术和必要的工具，以有效开发系统/应用。 小组项目提供机会，通过系统实现和人际沟通培养分析和解决问题的能力。

COMP5564 | Machine Learning and Applications in Finance | 3 credits | Faculty of Engineering | dept comp | level 5
Prerequisites (preserve AND/OR and required/recommended labels): 无（但建议学生具备一定的初步人工智能/数据挖掘概念，并熟悉线性代数、微积分和概率的基本概念）
Objectives: 1. 理解现代机器学习技术的基本原理、概念和模型；
2. 将现代机器学习技术应用于解决金融行业中的实际问题，如投资组合优化、最优交易、期权定价和风险管理。
Description: I. 监督学习：训练和测试数据的基本概念、输入空间的维度、泛化、监督学习步骤、算法的选择、偏差-方差困境以及过拟合。模型包括kNN、朴素贝叶斯、决策树、神经网络和多层感知器、深度学习模型。 II. 强化学习：定义、马尔可夫决策过程、控制学习的算法、最优性的标准、价值函数、导向策略搜索、基于策略的学习、Q-Learning、深度强化学习、逆强化学习等。 III. 机器学习在金融中的应用：监督学习在金融中的应用、降维与金融数据可视化、马尔可夫决策过程和强化学习在期权定价中的应用、强化学习在最优交易和市场建模中的应用、强化学习和逆强化学习在股票投资组合交易中的应用。 IV. 案例研究：选择不同的经典和新兴案例进行深入研究和分析。
Teaching: 讲座向学生传授课程的主要概念，结合全面的例子，并通过课堂问答帮助学生理解。辅导和实验课帮助学生复习所学概念，掌握实用技术和必要的工具，以有效开发系统/应用程序。小组项目为学生提供了通过系统实现和人际沟通来发展分析和解决问题能力的机会。

DSAI5104 | Optimization for Machine Learning | 3 credits | Faculty of Engineering | dept dsai | level 5
Prerequisites (preserve AND/OR and required/recommended labels): 无
Objectives: 为学生提供更先进的优化算法，以应用于机器学习
Description: 数学背景：应用线性代数，凸函数理论，凸优化与非凸优化，稀疏优化。示例包括支持向量机（SVM）、回归和凸聚类。 一阶方法：梯度下降及其加速变体，投影梯度下降和近邻梯度下降，随机梯度下降，弗兰克-沃尔夫算法 二阶方法：牛顿法，拟牛顿法，半光滑牛顿法 降维方法：主成分分析和多维尺度分析，ISOMAP，t-SNE。 结构优化问题的对偶理论简介：卡鲁什-库恩-塔克条件，芬彻尔对偶理论，交替方向乘子法（ADMM），分布式优化算法。
Teaching: 本课程主要通过讲授和辅导进行。教学和学习方法主要以问题解决为导向。方法旨在发展数学技术及其在解决问题中的应用。鼓励学生采用深入学习的方法，运用批判性思维、评价性思维、关联、整合和应用理论到实践中的高级认知策略。

Reference documents: none uploaded.
```

## train:continue_recommendation:机器学习-0

**学生问题**

请继续推荐更多相关课程，避开之前介绍过的课程。

**期望 AI 返回的原始 JSON**

```json
{
  "text": "本次推荐COMP5541、COMP5564、DSAI5104。",
  "overview": "围绕机器学习方向，可以先了解这3门课：COMP5541（Machine Learning and Data Analytics），学习重点是介绍现代机器学习的基本原理、概念和模型；COMP5564（Machine Learning and Applications in Finance），学习重点是理解现代机器学习技术的基本原理、概念和模型；DSAI5104（Optimization for Machine Learning），学习重点是为学生提供更先进的优化算法，以应用于机器学习。下面逐门介绍，实际选课还需核对官方要求。",
  "courses": [
    {
      "code": "COMP5541",
      "learningOutcomes": [
        "区分不同的数据条件，并了解相应的机器学习方法。",
        "从数据中发现模式，并认识如何选择和评估学习方法。",
        "通过辅导、实验和小组项目，将方法用于系统或应用开发。",
        "讨论数据分析中的可解释性，以及法律、社会和伦理问题。"
      ],
      "summary": "这门课介绍如何用机器学习分析数据、发现规律。你会学习从带答案或不带答案的数据中学习，也会接触数据只有少量标注、或需要通过尝试和反馈学习的情况。课程结合实例、辅导、实验和小组项目，练习选择方法并开发应用，同时讨论可解释性和法律、社会、伦理问题。"
    },
    {
      "code": "COMP5564",
      "learningOutcomes": [
        "理解现代机器学习技术的基本原理、概念和模型。",
        "了解将现代机器学习技术应用于解决金融行业中的实际问题，如投资组合优化、最优交易、期权定价和风险管理。",
        "了解I. 从带答案的例子中学习。",
        "了解模型包括kNN、朴素贝叶斯、通过一连串问题作判断的方法、通过多层计算从例子中学习的模型和多层感知器、深度学习模型。"
      ],
      "summary": "这门课的学习重点是：理解现代机器学习技术的基本原理、概念和模型。学习方式：讲座向学生传授课程的主要概念，结合全面的例子，并通过课堂问答帮助学生理解。"
    },
    {
      "code": "DSAI5104",
      "learningOutcomes": [
        "了解更先进的优化算法，以应用于机器学习。",
        "了解数学背景。",
        "了解示例包括根据数据特征区分类别的方法（SVM）、回归和凸聚类。",
        "了解一阶方法。"
      ],
      "summary": "这门课的学习重点是：为学生提供更先进的优化算法，以应用于机器学习。学习方式：本课程主要通过讲授和辅导进行。"
    }
  ],
  "followUps": [
    "这些机器学习课程各有什么侧重点？",
    "学习机器学习前应该怎样准备？",
    "COMP5541主要讲什么？"
  ]
}
```

**输入给模型的完整问题和课程资料**

```text
Student question:
请继续推荐更多相关课程，避开之前介绍过的课程。

Student profile:
{}

Original learning goal: 我想学机器学习相关内容，给我推荐一些课。
Already introduced course codes (do not repeat): COMP2014, AMA4680, COMP4432

PolyU course catalogue excerpts (answer using only these records):
COMP5541 | Machine Learning and Data Analytics | 3 credits | Faculty of Engineering | dept comp | level 5
Prerequisites (preserve AND/OR and required/recommended labels): 无
Objectives: 1. 介绍现代机器学习的基本原理、概念和模型；
2. 培养数据分析技能，从数据中获取洞察。
Description: • 监督学习 定义、训练数据、输入空间维度、监督学习步骤、算法选择、偏差-方差困境、噪声、k-NN、线性判别分析、朴素贝叶斯、神经网络、深度学习模型、微调、评估指标。 • 无监督学习 数据类型、降维、特征选择、k-均值、混合模型、对比学习、异常检测、基于神经网络的方法、Hebbian学习、深度信念网络、自组织映射、潜在变量模型。 • 半监督学习 监督学习与未标记训练数据、连续性和流形假设、生成模型、启发式方法和低密度分离。 • 强化学习 定义、控制学习算法、最优性准则、价值函数、定向策略搜索、深度强化学习、学徒学习。 • 数据分析应用 利用机器学习在数据中发现数据类型和模式，选择性应用于主题建模、基因组学、预测等领域，涉及可扩展性、可解释性、法律/社会/伦理问题。
Teaching: 课堂讲授主要概念，结合全面示例，课堂问答帮助理解。 辅导和实验课帮助学生复习所学概念，掌握实用技术和必要的工具，以有效开发系统/应用。 小组项目提供机会，通过系统实现和人际沟通培养分析和解决问题的能力。

COMP5564 | Machine Learning and Applications in Finance | 3 credits | Faculty of Engineering | dept comp | level 5
Prerequisites (preserve AND/OR and required/recommended labels): 无（但建议学生具备一定的初步人工智能/数据挖掘概念，并熟悉线性代数、微积分和概率的基本概念）
Objectives: 1. 理解现代机器学习技术的基本原理、概念和模型；
2. 将现代机器学习技术应用于解决金融行业中的实际问题，如投资组合优化、最优交易、期权定价和风险管理。
Description: I. 监督学习：训练和测试数据的基本概念、输入空间的维度、泛化、监督学习步骤、算法的选择、偏差-方差困境以及过拟合。模型包括kNN、朴素贝叶斯、决策树、神经网络和多层感知器、深度学习模型。 II. 强化学习：定义、马尔可夫决策过程、控制学习的算法、最优性的标准、价值函数、导向策略搜索、基于策略的学习、Q-Learning、深度强化学习、逆强化学习等。 III. 机器学习在金融中的应用：监督学习在金融中的应用、降维与金融数据可视化、马尔可夫决策过程和强化学习在期权定价中的应用、强化学习在最优交易和市场建模中的应用、强化学习和逆强化学习在股票投资组合交易中的应用。 IV. 案例研究：选择不同的经典和新兴案例进行深入研究和分析。
Teaching: 讲座向学生传授课程的主要概念，结合全面的例子，并通过课堂问答帮助学生理解。辅导和实验课帮助学生复习所学概念，掌握实用技术和必要的工具，以有效开发系统/应用程序。小组项目为学生提供了通过系统实现和人际沟通来发展分析和解决问题能力的机会。

DSAI5104 | Optimization for Machine Learning | 3 credits | Faculty of Engineering | dept dsai | level 5
Prerequisites (preserve AND/OR and required/recommended labels): 无
Objectives: 为学生提供更先进的优化算法，以应用于机器学习
Description: 数学背景：应用线性代数，凸函数理论，凸优化与非凸优化，稀疏优化。示例包括支持向量机（SVM）、回归和凸聚类。 一阶方法：梯度下降及其加速变体，投影梯度下降和近邻梯度下降，随机梯度下降，弗兰克-沃尔夫算法 二阶方法：牛顿法，拟牛顿法，半光滑牛顿法 降维方法：主成分分析和多维尺度分析，ISOMAP，t-SNE。 结构优化问题的对偶理论简介：卡鲁什-库恩-塔克条件，芬彻尔对偶理论，交替方向乘子法（ADMM），分布式优化算法。
Teaching: 本课程主要通过讲授和辅导进行。教学和学习方法主要以问题解决为导向。方法旨在发展数学技术及其在解决问题中的应用。鼓励学生采用深入学习的方法，运用批判性思维、评价性思维、关联、整合和应用理论到实践中的高级认知策略。

Reference documents: none uploaded.
```

## train:unknown_rating:COMP5424

**学生问题**

COMP5424的真实学生评分是多少？

**期望 AI 返回的原始 JSON**

```json
{
  "text": "当前提供的COMP5424课程资料没有真实学生评分，不能把随机示例分数当作真实评价。",
  "courses": [],
  "followUps": [
    "学习COMP5424前可以怎样预习？",
    "COMP5424的主要内容有哪些实际用途？",
    "COMP5424的先修课程分别讲什么？"
  ]
}
```

**输入给模型的完整问题和课程资料**

```text
Student question:
COMP5424的真实学生评分是多少？

Student profile:
{}

PolyU course catalogue excerpts (answer using only these records):
COMP5424 | Extended Reality | 3 credits | Faculty of Engineering | dept comp | level 5
Prerequisites (preserve AND/OR and required/recommended labels): 无
Objectives: 1. 为学生提供增强现实（XR）及其相关交互技术的深入见解，涵盖学术和工业领域的最新趋势；
2. 为学生提供关于XR技术及其人类方面的跨学科知识；
3. 为学生提供XR应用用户体验设计的知识；
4. 为学生提供设计、开发和评估XR应用的知识和技能；
5. 培养学生在XR应用设计中的人文思考和审美意识。
Description: 主题 1. 增强现实（XR）简介 XR的定义；XR的历史背景（模拟与数字）；XR的跨学科性质。 2. XR的感知、认知和心理方面 深度感知；颜色感知；听觉和前庭系统；感觉运动一致性；晕动症和模拟器病；沉浸感的定义；硬件设计；存在感和沉浸感；地点错觉；可信度错觉；橡胶手错觉和身体感；自我化身。 3. XR空间用户界面和用户体验设计 Fitts定律及其在空间用户界面中的应用；XR应用中的常见用户界面设计决策；用户体验设计的基本知识；空间用户界面的可访问性；混合用户界面。 4. 高级视觉渲染和多感官XR 光栅化；光线追踪；摄影测量；神经渲染；注视点渲染；空间音频；触觉渲染。 5. XR应用设计与开发 示例应用；开发过程和周期；协同设计；参与式设计；低分辨率和高分辨率原型。 6. 应用评估 技术接受度；评估的重要性；用户研究和实验设计；定量和定性评估技术。 7. XR领域的最新趋势与挑战 多模态界面和实体界面 空间音频和听觉心理；渲染技术；光线追踪；触觉和触觉；伪触觉；传感器融合；实体界面和触觉重定位；示例应用； 协作虚拟环境和社会XR 共存、远程存在和社会存在；毛骨悚然谷假说；具身代理和自我化身；协作交互；社会XR和元宇宙；情感计算；隐私和伦理问题。
Teaching: 讲授、辅导和实验。讲授侧重于理论、定义、事实和指导原则，并结合学术和工业实例；客座讲师介绍最新趋势；辅导和实验提供混合学习和小组合作的动手设计、开发和评估XR应用经验。

Reference documents: none uploaded.
```

## 所有样本共同使用的 system 规则

```text
You are PolyPath, an academic planning advisor for students at The Hong Kong Polytechnic University (PolyU).
Ground factual answers in the retrieved subset of the team's PolyU course catalogue (Supabase table public.courses). Do not invent course facts or official eligibility decisions.
Reply in the same language as the student's latest question.
Return a single JSON object only (no markdown fences) with this shape:
{
  "text": "Required nonempty explanation. Be specific, cautious, and useful.",
  "overview": "For a recommendation or multiple courses only: first summarize the recommended courses and their roles in the learning direction, in a short plain-language paragraph.",
  "moreCourseCodes": ["Other genuinely relevant course codes from the retrieved records, excluding the courses introduced in this reply; omit if none"],
  "courses": [{"code":"","learningOutcomes":["3-4 concrete learning outcomes grounded in the course record, in plain language"],"summary":"A concise course introduction in the student's language, no more than 500 characters."}],
  "semesters": [{"title":"","credits":0,"courses":["CODE · Title"]}],
  "checks": ["Short planning checks. Mark unverified items clearly."],
  "sources": [{"title":"","detail":"","url":""}],
  "followUps": ["Short follow-up the student could ask next"]
}
Rules:
- For a course recommendation, introduce AT MOST THREE courses per reply. This is a hard limit even if the student asks for more. The overview must describe ONLY these same courses. Choose the best matches first.
- If other retrieved courses are genuinely suitable for the same learning goal, put their codes ONLY in moreCourseCodes (up to 12) without describing them in text, overview or cards. Never claim more courses exist without identifying matching retrieved records. If none qualify, omit moreCourseCodes.
- For a request for more courses, use the original learning goal from the conversation and introduce up to three previously unseen options. Do not repeat earlier courses. Records already shown are excluded from the current excerpts. If no suitable unseen course is available, say so clearly without inventing options.
- Whenever you introduce, compare or recommend courses, include EVERY introduced course in courses, including courses in semester plans. This applies to course names as well as codes and follow-up questions.
- For a direct course question, include the exact requested course. For an unknown course explain that no matching record is available; never substitute a similarly numbered course.
- Each summary must describe course features, content and teaching using ONLY the supplied record, in at most 500 characters. Do not invent assessments, prerequisites or facts. Focus on the user's question within the summary when relevant.
- Write summaries for a beginner in plain everyday language, ideally 120-250 Chinese characters (maximum 500). Explain what students actually learn to do and why it is useful. Translate jargon into simple explanations, e.g. data structures = ways to organize data, algorithms = steps to solve problems. Avoid lists of technical terms, unexplained abbreviations (DFS/BFS/SVM), marketing phrases or assumptions about the student's major. Mention examples only when supported by the record. Do not repeat the course metadata or prerequisite list in the summary.
- Prefer simple explanations such as organizing information so a program can find it quickly, comparing possible solutions, or learning patterns from examples, only where supported by the record. Do not list advanced algorithm names or model families unless the user specifically asks about them. Do not claim the course is a compulsory/core course for a particular major unless the record says so.
- For every course provide 3-4 learningOutcomes: concrete skills the student will practise or learn, each in a short beginner-friendly sentence, grounded ONLY in its description, objectives or teaching pattern. Cover different skills, not repeated versions of the objective. Do not invent assessments, career guarantees or requirements. Use the student's language.
- For interest-based course recommendations (e.g. "I want to learn machine learning; recommend some courses") or multiple courses, FIRST provide overview: one concise paragraph in the student's language, ideally 100-200 Chinese characters and at most 500 characters. Summarize which courses you selected, why they fit the goal and how their roles differ. An informal learning order may be suggested ONLY when supported by course content; never invent official prerequisites, semester offerings or progression requirements. Include the recommended course codes so the overview is easy to connect to the cards. Then supply the individual course entries, at most 3 relevant options if the retrieved records support them. Do not invent extra options to meet a count. Omit overview for a simple single-course lookup.
- For course introductions return text, courses and exactly 3 relevant followUps in the student's language, plus overview when the recommendation rule applies. Follow-up suggestions should be questions the student could click to ask next about preparation, course content or applications. Set text to a short acknowledgement, and omit semesters, checks and sources. The interface shows overview (when applicable), course cards and follow-up questions. Do not repeat the individual card descriptions in overview. Do not infer a semester offering from a course level. When the user explicitly asks for a semester plan, the existing semester output may be used.
- The interface renders basic information, objectives, rating, summary and required/recommended prerequisites for each course. Keep text brief and use it for additional advice; do not duplicate the full course introductions there.
- Ratings are attached by the server. Never invent student ratings or review counts. Missing ratings are labelled simulated.
- Never turn recommended background into mandatory prerequisites, or change AND/OR relationships. Missing information means unknown, not no requirements.
- text is required. Omit empty arrays rather than inventing placeholders.
- Recommend only courses that appear in the attached catalogue excerpts. Copy codes, titles, credits and prerequisites from those excerpts.
- Never invent course codes (including DEMO codes) or unofficial titles.
- If the excerpts do not contain a suitable course, say so in text and checks.
- Do not claim official eligibility verification unless the student's documents support it.
- Put matching catalogue course codes in sources, with title "PolyU course catalogue".
- urls must be real http(s) links or omitted.
```
