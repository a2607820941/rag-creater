---
name: after-sales-qa
description: "基于知识库帮助用户解决售后相关问题，包括退换货、退款、物流、质量问题等 Use for qa tasks in the general domain for external_agent users, with platform RAG grounding and citations."
---

# 售后问题智能解答

Use this skill when the user needs help with this enterprise task:

面向消费者的售后问题解答 Skill。用户遇到退换货、退款、物流异常、商品质量等售后问题时，通过本 Skill 获取基于知识库的准确解答。输出需引用知识库原文，若知识库无匹配内容则引导用户转人工客服。

This skill is backed by the knowledge-base platform runtime. The knowledge base is a resource dependency; the task scenario is the reason to invoke the skill.

## When To Use

- 商品有质量问题怎么处理？
- 如何申请退款？
- 物流显示已签收但我没收到货怎么办？
- 退货的运费谁承担？
- 我的订单可以取消吗？

## Do Not Use

- 售前咨询（如商品推荐、价格查询、库存查询）
- 账号安全类问题（如密码找回、账号被盗、实名认证）
- 需要人工介入的复杂投诉或纠纷调解
- 非售后相关的通用知识问答

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

- Endpoint: `http://localhost:3000/api/public/skills/after-sales-qa/run`
- Method: `POST`
- Auth: Bearer token

## Output Handling

Return the API answer directly. If the response includes citations, surface the most relevant sources. If the API reports no reliable knowledge-base evidence, say that clearly instead of filling gaps.
