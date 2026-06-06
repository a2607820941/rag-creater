# Examples

## Requests That Should Use This Skill

- Webpack 和 Vite 有什么区别？
- 如何配置 Webpack 的 loader？
- Webpack 的 Tree Shaking 是什么？
- Webpack 的 entry 和 output 怎么配置？
- Webpack 的 HMR 热更新原理是什么？

## Requests That Should Not Use This Skill

- 回答与 Webpack 无关的问题（如 Vue、React 等框架问题）
- 代替正式文档或官方指南
- 提供代码生成或调试服务
- 回答需要实时数据或外部 API 的问题

## Boundary Questions

- The user asks a enterprise knowledge question answering question, but the retrieved evidence is incomplete. Respond with the supported part and list missing information.
- The user asks for an official decision, approval, exception, or legal/financial/security conclusion. Provide knowledge-grounded guidance only and state the required owner or process.
- The user mixes this enterprise knowledge task with an unrelated request. Answer only the supported task scenario and explain what is outside this Skill.

## Configured Test Examples

```json
[
  {
    "input": {
      "question": "Webpack 的 Tree Shaking 是什么？"
    },
    "expected": "如果知识库中有相关内容：返回带引用的解释，说明 Tree Shaking 是移除未使用代码的优化技术，并给出引用来源。如果知识库中无相关内容：返回 { answer: '无法回答', citations: [], hasAnswer: false, errorMessage: '当前知识库中未找到关于 Webpack Tree Shaking 的相关信息' }"
  },
  {
    "input": {
      "question": "如何配置 Webpack 的 loader？"
    },
    "expected": "如果知识库中有相关内容：返回带引用的 loader 配置说明，包括 module.rules 的使用方式。如果知识库中无相关内容：返回无法回答的明确提示。"
  }
]
```

## Sample Runtime Request

```json
{
  "input": {
  "question": "string"
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
      "id": "cmq1xzows002poraxuz8szcwv",
      "slug": "webpack-qa",
      "version": "0.1.0"
    }
  }
}
```
