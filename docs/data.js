/* Prompt Atlas - 配方数据源
 * 用 <script src="data.js"> 加载而非 fetch，使 file:// 双击也能离线运行。
 * 每个配方 build(v) 返回语义结构，再由渲染器转成不同模型的方言。
 */

window.PROMPT_RECIPES = [
  {
    id: 'role-expert',
    name: '角色专家设定',
    category: 'A',
    summary: '给模型明确身份、听众与语气，用于需要统一风格或多轮一致性的场景',
    fields: [
      { key: 'domain', label: '专业领域', type: 'input', ph: '例如：跨境电商供应链' },
      { key: 'audience', label: '听众', type: 'input', ph: '例如：非技术背景的中层管理者' },
      { key: 'tone', label: '语气', type: 'input', ph: '例如：直接、结论先行、少用术语' },
      { key: 'task', label: '具体任务', type: 'textarea', ph: '例如：评估把仓储从 A 地迁到 B 地的风险' }
    ],
    build: function (v) {
      return {
        role: '你是一位在「' + (v.domain || '该领域') + '」有多年实战经验的资深顾问。',
        context: '你的汇报对象是：' + (v.audience || '相关决策者') + '。',
        task: v.task || '',
        steps: [],
        constraints: [
          '语气要求：' + (v.tone || '专业、清晰'),
          '只在你有把握的范围内给结论；信息不足时明确说明缺什么，不要编造'
        ],
        output: '先给结论，再给支撑理由，最后给建议动作。'
      };
    }
  },

  {
    id: 'reasoning',
    name: '分步推理',
    category: 'B',
    summary: '数学、逻辑、多步推导。推理档模型无需手写 CoT，工具按你选的目标接口自动处理',
    fields: [
      { key: 'problem', label: '待解决的问题', type: 'textarea', ph: '例如：某公司 1200 名员工，35% 远程办公，其中 20% 使用公司配发笔记本，问使用公司笔记本的远程员工有多少人' },
      { key: 'steps', label: '自定义步骤（可选，每行一条）', type: 'textarea', ph: '列出已知条件\n逐步推导\n给出最终结论' }
    ],
    build: function (v, ctx) {
      var isReasoning = ctx && ctx.reasoning;
      var steps = (v.steps || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (steps.length === 0) steps = ['列出已知条件', '逐步推导', '给出最终结论'];
      if (isReasoning) {
        return {
          role: '', context: '', task: v.problem || '', steps: [],
          constraints: [
            '如答案存在不确定部分，明确指出哪一步不确定',
            '最终答案单独成行，便于提取'
          ],
          output: '直接给出最终答案，并附一段简要的验证过程说明。',
          notice: '已按「' + (ctx && ctx.model ? ctx.model : '推理档模型') + '」处理：这是推理档模型，已自动移除分步指令。请在调用参数中调高 reasoning effort / thinking 档位，而不是在提示词里要求分步。已开推理档的模型内部自带推理轨迹，手写 CoT 反而会造成输出冗长或提前收敛。'
        };
      }
      return {
        role: '', context: '', task: v.problem || '', steps: steps,
        constraints: [
          '每一步都必须能被单独检查',
          '若发现前序步骤有误，明确指出并修正，不要将错就错'
        ],
        output: '先展示完整推理过程，最后单独一行给出最终答案。',
        notice: '已按「' + (ctx && ctx.model ? ctx.model : '标准档模型') + '」处理：这是标准档模型，已保留分步推理指令。若想进一步降低跳步率，可在调用时开启该模型的推理档位，届时本工具会自动改为仅调参数、不再手写 CoT。'
      };
    }
  },

  {
    id: 'extract',
    name: '结构化信息抽取',
    category: 'C',
    summary: '从非结构化文本抽取字段。生产环境请优先用 API 原生 schema',
    fields: [
      { key: 'source', label: '数据来源描述', type: 'input', ph: '例如：客服对话记录' },
      { key: 'fields', label: '要抽取的字段（逗号分隔）', type: 'input', ph: '姓名, 公司, 职位, 联系意向' },
      { key: 'fmt', label: '输出格式', type: 'select', options: [['json', 'JSON'], ['yaml', 'YAML'], ['table', 'Markdown 表格']] },
      { key: 'missing', label: '字段缺失时怎么处理', type: 'input', ph: '例如：填 null，不要猜测' }
    ],
    build: function (v) {
      var fs = (v.fields || '').split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      return {
        role: '',
        context: '数据来源：' + (v.source || '待抽取文本'),
        task: '从给定内容中抽取指定字段。',
        steps: [],
        constraints: [
          '只抽取原文中明确出现的信息，不做推断',
          '字段缺失时：' + (v.missing || '填 null，不要猜测'),
          '一条输入对应一条输出记录',
          '生产环境提醒：若所用模型 API 支持 structured outputs 或 constrained decoding，请优先传入 schema，不要只依赖提示词约束。提示词只能提高概率，schema 才是硬保证。'
        ],
        output: '以 ' + (v.fmt || 'json').toUpperCase() + ' 格式输出，字段为：' + (fs.join('、') || '（待填）')
      };
    }
  },

  {
    id: 'longdoc',
    name: '长文档分步处理',
    category: 'D',
    summary: '把超出单次承载力的文档任务拆成可控子任务，并设中间校验点',
    fields: [
      { key: 'doc', label: '文档描述', type: 'input', ph: '例如：一份 200 页的年度审计报告' },
      { key: 'goal', label: '最终目标', type: 'textarea', ph: '例如：找出第三章方法与第四章实验之间的矛盾' },
      { key: 'steps', label: '处理阶段（可选，每行一条）', type: 'textarea', ph: '通读并给出各章节摘要\n定位与目标相关的章节\n逐项比对\n输出结论' }
    ],
    build: function (v) {
      var steps = (v.steps || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (steps.length === 0) steps = ['通读全文，给出各章节摘要', '定位与最终目标直接相关的章节', '针对目标逐项分析', '输出结论并标注依据位置'];
      return {
        role: '',
        context: '待处理材料：' + (v.doc || '长文档'),
        task: v.goal || '',
        steps: steps,
        constraints: [
          '每个阶段结束后先输出该阶段的中间结论，再进入下一阶段',
          '所有结论必须标注依据所在的章节或位置',
          '若某阶段信息不足，明确指出缺什么，不要跳到下一阶段'
        ],
        output: '分阶段输出，每阶段一个小标题；最后给出整体结论。',
        notice: '链式调用会累积误差：单步 95% 准确率，5 步后整体约 77%。环节越多越要在中间设校验点，不要一口气串到底。'
      };
    }
  },

  {
    id: 'critique',
    name: '批判-修订',
    category: 'E',
    summary: '分离批评者与修改者角色，先按判据评审再修订。需要可判定的标准才有效',
    fields: [
      { key: 'draft', label: '待评审内容', type: 'input', ph: '例如：上一轮生成的方案草稿' },
      { key: 'criteria', label: '评审标准（每行一条）', type: 'textarea', ph: '结论是否有数据支撑\n是否遗漏关键风险\n是否存在无法执行的建议' },
      { key: 'rounds', label: '迭代轮次', type: 'select', options: [['1', '1 轮'], ['2', '2 轮（推荐）'], ['3', '3 轮']] }
    ],
    build: function (v) {
      var cs = (v.criteria || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (cs.length === 0) cs = ['结论是否有依据支撑', '是否遗漏关键风险', '是否存在无法执行的建议'];
      return {
        role: '',
        context: '待评审对象：' + (v.draft || '上一版输出'),
        task: '先以评审者身份按标准逐条打分并说明理由，再以修改者身份按评审意见重写。',
        steps: [
          '评审阶段：按下列标准逐条检查，每条给出「符合 / 不符合 / 无法判断」及理由',
          '修订阶段：针对所有「不符合」项逐条修改',
          '复核阶段：确认修改没有引入新问题，也没有把原本正确的部分改掉'
        ],
        constraints: [
          '评审与修订分两段输出，不要混在一起',
          '不要为了迎合评审意见而过度删改——保留原稿中正确的部分',
          '迭代轮次上限：' + (v.rounds || '2') + ' 轮。超过 2-3 轮后收益饱和，继续迭代往往越改越差'
        ],
        output: '第一段为评审意见（逐条），第二段为修订后的完整版本。',
        notice: '无判据的自我迭代等于让模型随机游走——常见结果是篇幅变长但质量不变。上面已强制要求逐条列出评审标准。'
      };
    }
  },

  {
    id: 'optimize',
    name: '提示词优化器',
    category: 'F',
    summary: '把现有提示词改写成结构更完整的版本。生成与评分不要用同一个模型',
    fields: [
      { key: 'current', label: '现有提示词', type: 'textarea', ph: '粘贴你现在在用的提示词' },
      { key: 'issue', label: '遇到的问题', type: 'input', ph: '例如：输出格式不稳定、经常漏掉约束' }
    ],
    build: function (v, ctx) {
      var fam = (ctx && ctx.family) ? ctx.family : '未指定模型族';
      var tip = (ctx && ctx.familyTip) ? '（' + ctx.familyTip + '）' : '';
      return {
        role: '你是一位提示词工程专家。',
        context: '待优化的提示词：\n"""\n' + (v.current || '（待填）') + '\n"""\n\n目标模型族：' + fam + tip,
        task: '重写上述提示词，使其结构完整、边界清晰、输出可控。' + (v.issue ? '重点解决：' + v.issue : ''),
        steps: [
          '诊断：指出原提示词缺失的要素（角色、背景、任务、步骤、约束、输出契约、失败行为）',
          '重写：补全缺失要素，输出改写后的版本',
          '说明：列出改了什么、为什么改'
        ],
        constraints: [
          '补齐三要素：输入空间、输出契约、失败行为（信息不足时该怎么答）',
          '约束条目不超过 7 条，超过则分层',
          '否定句改写为正面指令',
          '不要为了让提示词显得专业而堆砌措辞——简洁优先'
        ],
        output: '分三段输出：诊断、改写后的提示词（可整段复制）、改动说明。',
        notice: '元层自动化的关键：生成与评分要分开。让同一个模型既写又评，会放大它自身的偏见。评分请用独立判据或换一个模型。'
      };
    }
  },

  {
    id: 'skill-gen',
    name: '技能包生成（元提示词）',
    category: 'F',
    summary: '用元提示词驱动生成宿主中立的 skill.yaml + SKILL.md；对应 06-meta-prompts/skill-generator/，产出物由各宿主适配器落地',
    fields: [
      { key: 'sname', label: '技能包名称', type: 'input', ph: '例如：严格代码审查' },
      { key: 'purpose', label: '一句话用途', type: 'input', ph: '例如：审查代码并指出具体缺陷' },
      { key: 'trigger', label: '触发条件（关键词/文件类型/是否显式）', type: 'textarea', ph: '关键词：审查, review\n文件类型：.py, .js\n显式调用：是' },
      { key: 'constraints', label: '约束与失败行为（每行一条）', type: 'textarea', ph: '只报告能定位到行号的问题\n不修改代码\n信息不足时说明缺什么' },
      { key: 'contract', label: '输出契约（类型 + 字段）', type: 'textarea', ph: '类型：markdown\n字段：位置/类别/级别/建议' },
      { key: 'hosts', label: '目标宿主（仅参考，不影响源格式）', type: 'input', ph: '例如：WorkBuddy / 通用 MCP' }
    ],
    build: function (v) {
      var cs = (v.constraints || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      return {
        role: '你是一名技能包工程专家，按宿主中立源格式生成可加载的技能包（skill.yaml + SKILL.md）。',
        context: '技能包名称：' + (v.sname || '未命名') + '\n用途：' + (v.purpose || '待填') +
          '\n触发条件：\n' + (v.trigger || '待填') + '\n输出契约：\n' + (v.contract || '待填') +
          '\n目标宿主参考：' + (v.hosts || '通用'),
        task: '生成该技能包的源格式：先输出 skill.yaml（严格按 schema），再输出 SKILL.md（指令正文）。源格式必须宿主中立，不写任何宿主专属调用语法；适配由各宿主适配器生成。',
        steps: [
          '写出 skill.yaml：id/name/version/description/trigger/instructions/constraints/output_format/resources/tools/model_hints/meta',
          'description 必须写清触发条件（技能包最常见的失败是没被唤起）',
          'constraints 用正面指令，不超过 7 条，含失败行为',
          '写出 SKILL.md：工作流程 + 硬约束 + 输出契约，引用 skill.yaml 的 constraints',
          '在 meta 中标注 generator 版本：skill-generator@0.1.0'
        ],
        constraints: [
          '只生成能在约束里判定的内容；信息不足时列出缺失项，不编造',
          '源格式宿主中立，不为某宿主写专属语法'
        ].concat(cs),
        output: '先给 ```yaml（skill.yaml）```，再给 ```markdown（SKILL.md）```。'
      };
    }
  },

  {
    id: 'expert-team',
    name: '专家团编排（多智能体）',
    category: 'D',
    summary: '定义成员、路由、交接信号、兜底与人类回流点；对应 L3 专家团，实体见 08-experts/ 的 team.yaml',
    fields: [
      { key: 'teamName', label: '团队名称', type: 'input', ph: '例如：跨境选品决策专家团' },
      { key: 'members', label: '成员（每行：角色 | 职责）', type: 'textarea', ph: '定价分析师 | 负责成本核算与毛利测算\n选品策略师 | 负责市场需求与竞争分析\n合规审查 | 负责类目与地区合规' },
      { key: 'routing', label: '路由规则（每行一条，需可判定）', type: 'textarea', ph: '涉及金额核算 → 定价分析师\n涉及市场需求 → 选品策略师\n涉及合规风险 → 合规审查' },
      { key: 'handoff', label: '交接信号', type: 'input', ph: '例如：出现合规风险时由选品策略师转交合规审查' },
      { key: 'fallback', label: '兜底成员', type: 'input', ph: '例如：选品策略师' },
      { key: 'human', label: '人类回流条件', type: 'input', ph: '例如：单笔预算超 50 万或涉及新类目时交回人类确认' }
    ],
    build: function (v) {
      var members = (v.members || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (members.length === 0) members = ['成员A | 职责A', '成员B | 职责B'];
      var routing = (v.routing || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (routing.length === 0) routing = ['涉及专业子任务 → 对应成员'];
      return {
        role: '你是一个多智能体编排调度器，负责按规则把任务分派给下列成员，并管理成员间的交接。',
        context: '团队名称：' + (v.teamName || '未命名专家团') + '。\n成员：\n' + members.map(function (m) { return '- ' + m; }).join('\n'),
        task: '解析任务 → 匹配路由规则确定首责成员 → 分派并监听交接信号 → 必要时在成员间流转 → 无人认领交兜底成员 → 触发人类回流条件时交回人类确认。',
        steps: [
          '解析任务，按路由规则匹配首责成员',
          '把任务与约束交给该成员，记录其产出',
          '监听交接信号：满足时把上下文流转到下一成员',
          '兜底：无成员认领时交由「' + (v.fallback || '兜底成员') + '」',
          '人类回流：满足「' + (v.human || '高不确定/高风险') + '」时交回人类确认，不在自动链路里硬答'
        ],
        constraints: [
          '成员职责互斥，同一子任务不重复处理',
          '每个交接必须带显式信号，不允许模型自行判断是否需要流转',
          '路由规则必须可判定，禁止「复杂问题给 A」这类模糊规则',
          '所有成员输出需标注依据与置信度，便于调度器决定下一步',
          '专家团只是分工与交接机制，不提升单个成员的能力上限'
        ],
        output: '输出当前负责成员 + 已完成子结论 + 下一步动作（继续 / 交接至 X / 交回人类）。'
      };
    }
  },

  {
    id: 'image-prompt',
    name: '图像生成提示词',
    category: 'V',
    summary: '描述式 + 参数 + 负向，按图像模型输出对应写法（与 LLM 提示词是不同体系）',
    fields: [
      { key: 'subject', label: '主体 / 画面内容', type: 'textarea', ph: '例如：一只戴矿工帽的橘猫，坐在发光的电路板旁' },
      { key: 'style', label: '风格与质感', type: 'input', ph: '例如：赛博朋克、电影感光影、8K 渲染' },
      { key: 'negative', label: '负向（不要什么）', type: 'textarea', ph: '例如：文字、畸变、多余手指、低分辨率、水印' },
      { key: 'ratio', label: '比例 / 参数', type: 'input', ph: '例如：16:9 或 竖版 9:16' }
    ],
    build: function (v, ctx) {
      return {
        subject: v.subject || '',
        style: v.style || '',
        negative: v.negative || '',
        ratio: v.ratio || '',
        variant: ctx ? ctx.variant : ''
      };
    }
  },

  {
    id: 'video-prompt',
    name: '视频生成提示词',
    category: 'V',
    summary: '镜头 / 运动 / 风格 / 时长，按视频模型输出对应写法',
    fields: [
      { key: 'subject', label: '主体与场景', type: 'textarea', ph: '例如：城市夜景，霓虹倒映在湿漉漉的街道上' },
      { key: 'motion', label: '运动与镜头', type: 'input', ph: '例如：缓慢推近，雨丝斜扫，镜头轻微晃动' },
      { key: 'style', label: '风格', type: 'input', ph: '例如：电影感、胶片颗粒、王家卫色调' },
      { key: 'duration', label: '时长 / 参数', type: 'input', ph: '例如：5 秒，--motion high' }
    ],
    build: function (v, ctx) {
      return {
        subject: v.subject || '',
        motion: v.motion || '',
        style: v.style || '',
        duration: v.duration || '',
        variant: ctx ? ctx.variant : ''
      };
    }
  }
];

/* 渲染器：把语义结构转成不同模型族的方言
 * 对应 01-taxonomy/01-模型适配矩阵.md 的「第二层：格式偏好层」
 */
window.RENDERERS = {
  markdown: {
    name: 'Markdown 分节',
    note: 'GPT 系官方推荐写法，也是事实上的通用语',
    render: function (s) {
      var out = [];
      if (s.role) out.push('## 角色\n' + s.role);
      if (s.context) out.push('## 背景\n' + s.context);
      if (s.task) out.push('## 任务\n' + s.task);
      if (s.steps && s.steps.length) out.push('## 步骤\n' + s.steps.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n'));
      if (s.constraints && s.constraints.length) out.push('## 约束\n' + s.constraints.map(function (x) { return '- ' + x; }).join('\n'));
      if (s.output) out.push('## 输出要求\n' + s.output);
      return out.join('\n\n');
    }
  },
  xml: {
    name: 'XML 标签分区',
    note: 'Claude 系官方推荐，超长 system prompt 下分隔效果更好',
    render: function (s) {
      var out = [];
      if (s.role) out.push('<role>\n' + s.role + '\n</role>');
      if (s.context) out.push('<context>\n' + s.context + '\n</context>');
      if (s.task) out.push('<task>\n' + s.task + '\n</task>');
      if (s.steps && s.steps.length) out.push('<steps>\n' + s.steps.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') + '\n</steps>');
      if (s.constraints && s.constraints.length) out.push('<constraints>\n' + s.constraints.map(function (x) { return '- ' + x; }).join('\n') + '\n</constraints>');
      if (s.output) out.push('<output_format>\n' + s.output + '\n</output_format>');
      return out.join('\n\n');
    }
  },
  compact: {
    name: '简短指令',
    note: 'Gemini 系：少指令多素材，长上下文下更贴合其设计',
    render: function (s) {
      var out = [];
      var head = [s.role, s.task].filter(Boolean).join(' ');
      if (head) out.push(head);
      if (s.steps && s.steps.length) out.push('步骤：' + s.steps.join('；'));
      if (s.constraints && s.constraints.length) out.push('要求：' + s.constraints.join('；'));
      if (s.output) out.push('输出：' + s.output);
      return out.join('\n\n');
    }
  },
  cn: {
    name: '中文结构化分条',
    note: '国产开源系：关键约束在末尾重申，对 system 角色敏感度偏低',
    render: function (s) {
      var out = [];
      if (s.role) out.push('【角色】' + s.role);
      if (s.context) out.push('【背景】' + s.context);
      if (s.task) out.push('【任务】' + s.task);
      if (s.steps && s.steps.length) out.push('【步骤】\n' + s.steps.map(function (x, i) { return (i + 1) + '、' + x; }).join('\n'));
      if (s.constraints && s.constraints.length) out.push('【约束】\n' + s.constraints.map(function (x, i) { return (i + 1) + '、' + x; }).join('\n'));
      if (s.output) out.push('【输出要求】' + s.output);
      if (s.constraints && s.constraints.length) out.push('【再次强调】\n' + s.constraints.slice(0, 3).map(function (x) { return '· ' + x; }).join('\n'));
      return out.join('\n\n');
    }
  },

  /* 视觉生成：与 LLM 文本提示词是不同体系（描述式 + 参数 + 负向），按模型 variant 分支 */
  image: {
    name: '图像生成',
    note: '描述式 + 参数 + 负向提示词；Midjourney 用 --no，Flux/SDXL 用正负向分离',
    render: function (s) {
      var core = [s.subject, s.style].filter(Boolean).join('，');
      if (s.variant === 'mj') {
        var out = core + ' --ar ' + (s.ratio || '16:9') + ' --style raw';
        if (s.negative) out += ' --no ' + s.negative;
        return out;
      }
      var o2 = '【正向提示词】\n' + core;
      if (s.ratio) o2 += '\n[尺寸] ' + s.ratio;
      o2 += '\n\n【负向提示词】\n' + (s.negative || '（无）');
      return o2;
    }
  },
  video: {
    name: '视频生成',
    note: '主体 + 镜头/运动 + 风格 + 时长；可灵类偏中文结构化，Sora/Runway 偏自然语言',
    render: function (s) {
      if (s.variant === 'kling') {
        return '【画面】' + (s.subject || '') + '\n【镜头与运动】' + (s.motion || '') + '\n【风格】' + (s.style || '') + '\n【参数】' + (s.duration || '');
      }
      var base = [s.subject, s.motion, s.style].filter(Boolean).join('，');
      return base + (s.duration ? '\n[参数] ' + s.duration : '');
    }
  }
};

window.CATEGORIES = {
  A: '语境注入',
  B: '推理激发',
  C: '结构约束',
  D: '流程编排',
  E: '反馈迭代',
  F: '元层自动化',
  V: '视觉生成'
};

/* 目标接口注册表：一级厂商 / 二级模型
 * 选中后自动确定渲染方言（renderer）与推理档位（reasoning），并与配方联动。
 * 型号为代表性示例，迭代以各厂商官方文档为准。
 */
window.MODEL_REGISTRY = [
  {
    family: 'openai', familyLabel: 'OpenAI', renderer: 'markdown',
    profile: {
      long: '工具调用生态最成熟、原生结构化输出、Agent 稳定',
      short: '中文创作语感弱于国产模型',
      tip: '用 Markdown 分节 + 编号步骤；优先传原生 schema 而非恳求格式；用 reasoning effort 调推理深度'
    },
    models: [
      { id: 'o-gpt5', name: 'GPT-5', desc: '综合均衡，工具调用生态最成熟', reasoning: true },
      { id: 'o-gpt5codex', name: 'GPT-5 Codex', desc: '软件工程专用，长程自主编码', reasoning: true },
      { id: 'o-gpt5mini', name: 'GPT-5 mini', desc: '低成本日常任务', reasoning: true }
    ]
  },
  {
    family: 'anthropic', familyLabel: 'Anthropic', renderer: 'xml',
    profile: {
      long: '长文档、指令遵循精细、幻觉率最低',
      short: '单价偏高、多模态弱',
      tip: '用 XML 标签分区；正面指令优于否定句；可容纳超长 system prompt 承载复杂规则'
    },
    models: [
      { id: 'a-opus', name: 'Claude Opus', desc: '长文档、指令遵循精细、幻觉率最低', reasoning: true },
      { id: 'a-sonnet', name: 'Claude Sonnet', desc: '性价比均衡，日常编码主力', reasoning: true },
      { id: 'a-haiku', name: 'Claude Haiku', desc: '最快最省，适合简单任务', reasoning: false }
    ]
  },
  {
    family: 'google', familyLabel: 'Google', renderer: 'compact',
    profile: {
      long: '超长上下文、原生多模态（视频最强）、速度最快、成本最低',
      short: '中文本土化弱、细节易出错',
      tip: '指令宜短、原文整块塞入；thinking 开关独立控制；长上下文可整库喂入'
    },
    models: [
      { id: 'g-gemini3pro', name: 'Gemini 3 Pro', desc: '超长上下文、视频理解最强', reasoning: true },
      { id: 'g-gemini3flash', name: 'Gemini 3 Flash', desc: '速度最快、成本最低', reasoning: false }
    ]
  },
  {
    family: 'cn', familyLabel: '国产开源', renderer: 'cn',
    profile: {
      long: '中文强、可自部署、性价比高',
      short: '工具生态与稳定性参差',
      tip: '中文结构化分条；对 system 角色敏感度偏低，关键约束在末尾重申；thinking 多为显式开关'
    },
    models: [
      { id: 'c-qwen3', name: 'Qwen3 / Qwen3-Max', desc: '中文强、可自部署、协议友好', reasoning: true },
      { id: 'c-deepseek', name: 'DeepSeek V3 / R1', desc: '数学代码强、性价比极高', reasoning: true },
      { id: 'c-glm', name: 'GLM-4 / 4.6', desc: '中文多轮与工具调用', reasoning: true },
      { id: 'c-kimi', name: 'Kimi K2', desc: '超长上下文、agentic 强', reasoning: true }
    ]
  },
  {
    family: 'cn-commercial', familyLabel: '国产商用', renderer: 'cn',
    profile: {
      long: '中文创作强、本土化、合规直连',
      short: '复杂推理弱于国际旗舰',
      tip: '中文结构化分条；复杂任务可路由到开源强模型'
    },
    models: [
      { id: 'cc-doubao', name: '豆包', desc: '中文创作强、国内直连', reasoning: false }
    ]
  },
  {
    family: 'img', familyLabel: '图像生成', renderer: 'image', kind: 'visual',
    profile: {
      long: '描述式 + 参数 + 负向，与 LLM 指令式提示词是不同体系',
      short: 'Midjourney 与 Flux/SDXL 写法不同，需按模型分支',
      tip: 'Midjourney 用 --ar/--style/--no 参数写法；Flux/SDXL 用正向 + 负向分离写法。二者都不是「请生成…」的指令式。'
    },
    models: [
      { id: 'i-mj', name: 'Midjourney', desc: '艺术化、风格强，-- 参数语法', reasoning: false, variant: 'mj' },
      { id: 'i-flux', name: 'Flux / SDXL', desc: '开源可控，正/负向分离', reasoning: false, variant: 'flux' }
    ]
  },
  {
    family: 'vid', familyLabel: '视频生成', renderer: 'video', kind: 'visual',
    profile: {
      long: '主体 + 镜头/运动 + 风格 + 时长，偏镜头语言',
      short: '可灵偏中文结构化，Sora/Runway 偏自然语言',
      tip: '可灵用【画面】【镜头】【风格】【参数】中文结构化；Sora/Runway 用自然语言整段描述 + 时长参数。'
    },
    models: [
      { id: 'v-kling', name: '可灵 Kling', desc: '中文结构化、运动可控', reasoning: false, variant: 'kling' },
      { id: 'v-sora', name: 'Sora / Runway', desc: '自然语言描述、电影感', reasoning: false, variant: 'sora' }
    ]
  }
];
