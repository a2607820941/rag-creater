# Examples

## Requests That Should Use This Skill

- 帮我筛选符合 Java 开发岗位的简历
- 这份简历有哪些亮点和不足？
- 根据岗位 JD 评估候选人的匹配度

## Requests That Should Not Use This Skill

- 不处理非简历类文档的分析
- 不生成简历内容或修改简历
- 不进行面试安排或招聘流程管理
- 不处理薪资谈判或offer相关事宜

## Boundary Questions

- The user asks a HR case triage question, but the retrieved evidence is incomplete. Respond with the supported part and list missing information.
- The user asks for an official decision, approval, exception, or legal/financial/security conclusion. Provide knowledge-grounded guidance only and state the required owner or process.
- The user mixes this HR task with an unrelated request. Answer only the supported task scenario and explain what is outside this Skill.

## Configured Test Examples

```json
[
  {
    "input": {
      "resumeText": "张三，5年Java开发经验，熟悉Spring Boot、微服务架构，有电商项目经验",
      "jobDescription": "Java高级开发工程师，要求3年以上Java经验，熟悉Spring框架，有分布式系统经验"
    },
    "expected": "返回JSON格式评估结果，包含候选人姓名、匹配度评分、亮点、不足和建议。如果知识库中有评估方法论，应引用作为评分依据。"
  }
]
```

## Sample Runtime Request

```json
{
  "input": {
  "resumeText": "string",
  "jobDescription": "string"
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
      "id": "cmq6nxf8o0035aovgri2txxaz",
      "slug": "resume-evaluation-and-matching",
      "version": "0.1.0"
    }
  }
}
```
