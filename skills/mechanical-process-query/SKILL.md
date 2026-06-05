---
name: mechanical-process-query
description: "基于机械产品工艺知识库，查询工艺参数、规范标准、材料选择建议和加工流程步骤。当知识库中无相关信息时返回空结果。 Use when an agent needs to invoke the published HTTP API Skill, follow its input/output schema, or return knowledge-grounded answers with citations."
---

# 机械产品工艺查询

Use this skill to call the 机械产品工艺查询 API Skill from the knowledge-base platform.

## Workflow

1. Confirm the user request matches this skill's purpose.
2. Read `references/api.md` for the HTTP contract before calling the endpoint.
3. Read `references/knowledge-scope.md` only when knowledge-base coverage matters.
4. Send a JSON request that matches the input schema.
5. Use returned citations when explaining knowledge-grounded answers.

## Runtime

- Endpoint: `http://localhost:3000/api/public/skills/mechanical-process-query/run`
- Method: `POST`
- Auth: Bearer token

## Output Handling

Return the API answer directly. If the response includes citations, surface the most relevant sources. If the API reports no reliable knowledge-base evidence, say that clearly instead of filling gaps.
