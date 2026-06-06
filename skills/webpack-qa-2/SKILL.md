---
name: webpack-qa-2
description: "基于八股文知识库回答业务运营同学关于 Webpack 的提问，必须返回引用，证据不足时说明无法回答 Use for qa tasks in the general domain for expert_agent users, with platform RAG grounding and citations."
---

# Webpack 知识问答

Use this skill when the user needs help with this enterprise task:

基于八股文知识库回答业务运营同学关于 Webpack 的提问，必须返回引用，证据不足时说明无法回答 Use this Skill when expert agents need question answering for enterprise knowledge workflows. The Skill is triggered by the business task scenario, then uses configured enterprise knowledge bases as evidence sources.

This skill is backed by the knowledge-base platform runtime. The knowledge base is a resource dependency; the task scenario is the reason to invoke the skill.

## When To Use

- expert agents asks for question answering in a enterprise knowledge workflow and expects a knowledge-grounded answer with citations.
- Help me handle a enterprise knowledge task: 基于八股文知识库回答业务运营同学关于 Webpack 的提问，必须返回引用，证据不足时说明无法回答 Use this Skill when expert agents need question answering for enterprise knowledge workflows. The Skill is triggered by the business task scenario, then uses configured enterprise knowledge bases as evidence sources.
- Use the Webpack 知识问答 Skill to answer a enterprise knowledge qa question and show the source evidence.

## Do Not Use

- Do not use for generic chat or unrelated knowledge-base search.
- Do not use as a final approval, legal opinion, financial decision, or security exception workflow.
- Do not answer outside the configured knowledge evidence when the task requires enterprise policy accuracy.

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

- Endpoint: `http://localhost:3000/api/public/skills/webpack-qa-2/run`
- Method: `POST`
- Auth: Bearer token

## Output Handling

Return the API answer directly. If the response includes citations, surface the most relevant sources. If the API reports no reliable knowledge-base evidence, say that clearly instead of filling gaps.
