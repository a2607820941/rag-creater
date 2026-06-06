---
name: webpack-qa
description: "基于八股文知识库回答业务运营同学关于 Webpack 的提问，必须返回引用，证据不足时说明无法回答 Use for qa tasks in the general domain for employee users, with platform RAG grounding and citations."
---

# Webpack 知识问答

Use this skill when the user needs help with this enterprise task:

为业务运营同学提供 Webpack 相关知识的问答服务。基于八股文知识库进行检索，回答必须附带知识库引用。当知识库中缺乏相关信息时，明确告知无法回答，不进行推测或编造。

This skill is backed by the knowledge-base platform runtime. The knowledge base is a resource dependency; the task scenario is the reason to invoke the skill.

## When To Use

- Webpack 和 Vite 有什么区别？
- 如何配置 Webpack 的 loader？
- Webpack 的 Tree Shaking 是什么？
- Webpack 的 entry 和 output 怎么配置？
- Webpack 的 HMR 热更新原理是什么？

## Do Not Use

- 回答与 Webpack 无关的问题（如 Vue、React 等框架问题）
- 代替正式文档或官方指南
- 提供代码生成或调试服务
- 回答需要实时数据或外部 API 的问题

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

- Endpoint: `http://localhost:3000/api/public/skills/webpack-qa/run`
- Method: `POST`
- Auth: Bearer token

## Output Handling

Return the API answer directly. If the response includes citations, surface the most relevant sources. If the API reports no reliable knowledge-base evidence, say that clearly instead of filling gaps.
