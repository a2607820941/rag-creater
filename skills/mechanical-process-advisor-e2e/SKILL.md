---
name: mechanical-process-advisor-e2e
description: "当用户询问机械产品制造工艺、加工步骤、工艺要求或工艺知识时使用，基于机械产品工艺知识库回答并返回引用。 Use when an agent needs to invoke the published HTTP API Skill, follow its input/output schema, or return knowledge-grounded answers with citations."
---

# 机械产品工艺顾问验证 Skill

Use this skill to call the 机械产品工艺顾问验证 Skill API Skill from the knowledge-base platform.

## Workflow

1. Confirm the user request matches this skill's purpose.
2. Read `references/api.md` for the HTTP contract before calling the endpoint.
3. Read `references/knowledge-scope.md` only when knowledge-base coverage matters.
4. Send a JSON request that matches the input schema.
5. Use returned citations when explaining knowledge-grounded answers.

## Runtime

- Endpoint: `http://localhost:3000/api/public/skills/mechanical-process-advisor-e2e/run`
- Method: `POST`
- Auth: Bearer token

## Output Handling

Return the API answer directly. If the response includes citations, surface the most relevant sources. If the API reports no reliable knowledge-base evidence, say that clearly instead of filling gaps.
