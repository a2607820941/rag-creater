# Examples

## Requests That Should Use This Skill

- 商品有质量问题怎么处理？
- 如何申请退款？
- 物流显示已签收但我没收到货怎么办？
- 退货的运费谁承担？
- 我的订单可以取消吗？

## Requests That Should Not Use This Skill

- 售前咨询（如商品推荐、价格查询、库存查询）
- 账号安全类问题（如密码找回、账号被盗、实名认证）
- 需要人工介入的复杂投诉或纠纷调解
- 非售后相关的通用知识问答

## Boundary Questions

- The user asks a enterprise knowledge question answering question, but the retrieved evidence is incomplete. Respond with the supported part and list missing information.
- The user asks for an official decision, approval, exception, or legal/financial/security conclusion. Provide knowledge-grounded guidance only and state the required owner or process.
- The user mixes this enterprise knowledge task with an unrelated request. Answer only the supported task scenario and explain what is outside this Skill.

## Configured Test Examples

```json
[
  {
    "input": {
      "question": "商品有质量问题怎么处理？"
    },
    "expected": "根据知识库提供退换货流程、联系客服方式等解答，并附上引用来源。"
  },
  {
    "input": {
      "question": "如何申请退款？"
    },
    "expected": "提供退款申请入口、操作步骤、退款时效等信息，并附上引用来源。"
  },
  {
    "input": {
      "question": "今天天气怎么样？"
    },
    "expected": "needs_human: false，告知用户该问题不在售后范围内，建议转人工或重新提问。"
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
      "id": "cmqiv098700as90vby0x7566r",
      "slug": "after-sales-qa",
      "version": "0.1.0"
    }
  }
}
```
