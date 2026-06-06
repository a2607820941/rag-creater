# Task Scenario

## Identity

- Domain: general
- Intent: qa
- Audience: expert_agent
- Output style: answer_with_citations

## Task Description

基于八股文知识库回答业务运营同学关于 Webpack 的提问，必须返回引用，证据不足时说明无法回答 Use this Skill when expert agents need question answering for enterprise knowledge workflows. The Skill is triggered by the business task scenario, then uses configured enterprise knowledge bases as evidence sources.

## When To Use

- expert agents asks for question answering in a enterprise knowledge workflow and expects a knowledge-grounded answer with citations.
- Help me handle a enterprise knowledge task: 基于八股文知识库回答业务运营同学关于 Webpack 的提问，必须返回引用，证据不足时说明无法回答 Use this Skill when expert agents need question answering for enterprise knowledge workflows. The Skill is triggered by the business task scenario, then uses configured enterprise knowledge bases as evidence sources.
- Use the Webpack 知识问答 Skill to answer a enterprise knowledge qa question and show the source evidence.

## Do Not Use

- Do not use for generic chat or unrelated knowledge-base search.
- Do not use as a final approval, legal opinion, financial decision, or security exception workflow.
- Do not answer outside the configured knowledge evidence when the task requires enterprise policy accuracy.

## Enterprise Context

This Skill is designed for corporate information system workflows such as HR, finance, legal, procurement, approvals, workplace services, security, privacy, compliance, and AIGC enablement. Treat the configured knowledge bases as evidence sources, not as the Skill identity.
