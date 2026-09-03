# 技能包（L2）

> 本层收纳可跨 Agent 宿主加载的技能包。
> **内容待填**——此处先固化结构与源格式，避免资产进来后再返工。

---

## 什么是技能包

提示词 + 流程 + 约束的组合单元，可被宿主直接加载并在满足条件时自动触发。

与 L1 提示词的区别：

| | L1 提示词 | L2 技能包 |
|---|---|---|
| 形态 | 一段可复制的文本 | 一个带元数据的可加载单元 |
| 触发 | 人工粘贴调用 | 宿主按条件自动唤起 |
| 内容 | 单一指令 | 指令 + 约束 + 输出契约 + 资源依赖 |
| 复用 | 靠人记着用 | 靠宿主机制保障 |

---

## 目录约定

```
07-skills/
└── <skill-id>/
    ├── skill.yaml          # 源格式（宿主中立，唯一真相）
    ├── SKILL.md            # 指令正文（源格式引用此文件）
    ├── resources/          # 依赖资源
    └── adapters/           # 各宿主适配产物（由脚本生成，勿手改）
```

**关键约束**：`adapters/` 下的文件由源格式生成，**禁止手工编辑**。要改就改 `skill.yaml` 后重跑适配器——否则多宿主间必然漂移。

---

## 源格式示例

字段定义见 `09-hosts/00-术语与一致性策略.md` 第五节。

```yaml
id: code-review-strict
name: 严格代码审查
version: 0.1.0
description: >
  当用户请求审查代码、检查 PR、或询问某段实现是否存在问题时使用。
  适用于需要指出具体缺陷而非泛泛评价的场景。
trigger:
  keywords: [审查, review, 检查代码, PR]
  file_types: []
  explicit: true
instructions: SKILL.md
constraints:
  - 只报告能在代码中定位到具体行号的问题
  - 不修改代码，只输出审查意见
  - 信息不足以判定时，明确说明缺什么
output_format:
  type: markdown
  schema:
    - 问题位置（文件:行号）
    - 问题类别
    - 严重级别
    - 修改建议
resources: []
tools: []
model_hints:
  prefer_reasoning_tier: true
  needs_structured_output: false
meta:
  author: ""
  license: MIT
```

---

## 收录标准

一个技能包要进这个库，需满足：

1. **`description` 写得清触发条件**——技能包最常见的失败是根本没被唤起
2. **有明确的失败行为**——信息不足时该说什么，而不是硬答
3. **`constraints` 用正面指令**——避免否定句堆叠
4. **至少在一个真实宿主上冒烟测试通过**（触发 → 执行 → 输出符合契约）
5. **源格式完整**，且适配产物由脚本生成

---

## 待填

- [x] 实际技能包资产 → `code-review-strict/`（含 `skill.yaml` + `SKILL.md`）
- [ ] `skill.yaml` 的正式 JSON Schema
- [ ] 适配器脚本（源格式 → 各宿主格式）
- [ ] 冒烟测试用例集
