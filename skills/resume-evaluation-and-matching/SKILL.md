---
name: resume-evaluation-and-matching
description: "根据用户提供的简历文本和岗位JD，评估候选人与岗位的匹配度，分析亮点与不足，并给出建议 Use for case_triage tasks in the hr domain for manager users, with platform RAG grounding and citations."
---

# 简历评估与匹配分析

Use this skill when the user needs help with this enterprise task:

管理者提供候选人简历文本和岗位JD，Skill基于知识库中的评估方法论，对简历进行综合分析，输出匹配度评分、亮点、不足和建议。适用于招聘筛选、简历初评场景。

This skill is backed by the knowledge-base platform runtime. The knowledge base is a resource dependency; the task scenario is the reason to invoke the skill.

## When To Use

- 帮我筛选符合 Java 开发岗位的简历
- 这份简历有哪些亮点和不足？
- 根据岗位 JD 评估候选人的匹配度

## Do Not Use

- 不处理非简历类文档的分析
- 不生成简历内容或修改简历
- 不进行面试安排或招聘流程管理
- 不处理薪资谈判或offer相关事宜

## Workflow

1. Confirm the request matches the task scenario and does not match the non-goals.
2. Read `references/task-scenario.md` if you need more detail on the domain, intent, audience, or output style.
3. Read `references/api.md` before calling the runtime endpoint.
4. Send a JSON request that matches the input schema.
5. Use returned citations when explaining knowledge-grounded answers.
6. If the runtime reports weak or missing evidence, say what information is missing instead of filling gaps.

## Additional Resources

- For the task contract and invocation examples, see [references/task-scenario.md](references/task-scenario.md).
- For concrete request and response examples, see [references/examples.md](references/examples.md).
- For the HTTP runtime contract, see [references/api.md](references/api.md).
- For runtime behavior and safety boundaries, see [references/runtime.md](references/runtime.md).
- For configured knowledge resources, see [references/knowledge-scope.md](references/knowledge-scope.md).
- For one-command installation into Codex or Claude Code, see [INSTALL.md](INSTALL.md).
- To call the runtime from Claude Code or Codex, use [scripts/run-skill.mjs](scripts/run-skill.mjs) with `SKILL_API_KEY`.

## Runtime

- Endpoint: `http://localhost:3000/api/public/skills/resume-evaluation-and-matching/run`
- Method: `POST`
- Auth: Bearer token

## Output Handling

Return the API answer directly. If the response includes citations, surface the most relevant sources. If the API reports no reliable knowledge-base evidence, say that clearly instead of filling gaps.
