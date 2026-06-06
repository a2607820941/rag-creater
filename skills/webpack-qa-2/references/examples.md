# Examples

## Requests That Should Use This Skill

- expert agents asks for question answering in a enterprise knowledge workflow and expects a knowledge-grounded answer with citations.
- Help me handle a enterprise knowledge task: 基于八股文知识库回答业务运营同学关于 Webpack 的提问，必须返回引用，证据不足时说明无法回答 Use this Skill when expert agents need question answering for enterprise knowledge workflows. The Skill is triggered by the business task scenario, then uses configured enterprise knowledge bases as evidence sources.
- Use the Webpack 知识问答 Skill to answer a enterprise knowledge qa question and show the source evidence.

## Requests That Should Not Use This Skill

- Do not use for generic chat or unrelated knowledge-base search.
- Do not use as a final approval, legal opinion, financial decision, or security exception workflow.
- Do not answer outside the configured knowledge evidence when the task requires enterprise policy accuracy.

## Boundary Questions

- The user asks a enterprise knowledge question answering question, but the retrieved evidence is incomplete. Respond with the supported part and list missing information.
- The user asks for an official decision, approval, exception, or legal/financial/security conclusion. Provide knowledge-grounded guidance only and state the required owner or process.
- The user mixes this enterprise knowledge task with an unrelated request. Answer only the supported task scenario and explain what is outside this Skill.

## Configured Test Examples

No configured test examples. Add `config.testExamples` to support one-click verification in future UI.

## Sample Runtime Request

```json
{
  "input": {
  "question": "string",
  "context": "string",
  "outputStyle": "string"
}
}
```

## Expected Response Shape

```json
{
  "success": true,
  "data": {
    "answer": "Knowledge-grounded answer for the configured task scenario.",
    "citations": [],
    "confidence": "medium",
    "followups": [
      "Missing evidence or next step when the knowledge base is incomplete."
    ],
    "skill": {
      "id": "cmq1y6f8j002uoraxbr3hv5au",
      "slug": "webpack-qa-2",
      "version": "0.1.0"
    }
  }
}
```
