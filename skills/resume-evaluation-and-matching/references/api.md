# API Reference

## Runtime Contract

```json
{
  "type": "http",
  "mode": "platform_rag",
  "endpoint": "http://localhost:3000/api/public/skills/resume-evaluation-and-matching/run",
  "method": "POST",
  "auth": {
    "type": "bearer"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "resumeText": {
        "type": "string",
        "description": "候选人的简历文本内容"
      },
      "jobDescription": {
        "type": "string",
        "description": "岗位JD（职位描述），包含岗位要求、职责、技能要求等"
      }
    },
    "required": [
      "resumeText",
      "jobDescription"
    ]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "candidateName": {
        "type": "string",
        "description": "候选人姓名"
      },
      "matchScore": {
        "type": "number",
        "description": "匹配度评分，0-100分",
        "minimum": 0,
        "maximum": 100
      },
      "highlights": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "简历亮点列表"
      },
      "weaknesses": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "简历不足/待改进点列表"
      },
      "recommendation": {
        "type": "string",
        "description": "综合建议，如是否推荐面试、需要关注的风险点等"
      }
    },
    "required": [
      "candidateName",
      "matchScore",
      "highlights",
      "weaknesses",
      "recommendation"
    ]
  }
}
```

## Request

```http
POST http://localhost:3000/api/public/skills/resume-evaluation-and-matching/run
Authorization: Bearer <api-key>
Content-Type: application/json
```

```json
{
  "input": {
  "resumeText": "string",
  "jobDescription": "string"
}
}
```

## Response

```json
{
  "success": true,
  "data": {
    "answer": "string",
    "citations": [],
    "skill": {
      "id": "cmq6nxf8o0035aovgri2txxaz",
      "slug": "resume-evaluation-and-matching",
      "version": "0.1.0"
    }
  }
}
```

## Input Schema

```json
{
  "type": "object",
  "properties": {
    "resumeText": {
      "type": "string",
      "description": "候选人的简历文本内容"
    },
    "jobDescription": {
      "type": "string",
      "description": "岗位JD（职位描述），包含岗位要求、职责、技能要求等"
    }
  },
  "required": [
    "resumeText",
    "jobDescription"
  ]
}
```

## Output Schema

```json
{
  "type": "object",
  "properties": {
    "candidateName": {
      "type": "string",
      "description": "候选人姓名"
    },
    "matchScore": {
      "type": "number",
      "description": "匹配度评分，0-100分",
      "minimum": 0,
      "maximum": 100
    },
    "highlights": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "简历亮点列表"
    },
    "weaknesses": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "简历不足/待改进点列表"
    },
    "recommendation": {
      "type": "string",
      "description": "综合建议，如是否推荐面试、需要关注的风险点等"
    }
  },
  "required": [
    "candidateName",
    "matchScore",
    "highlights",
    "weaknesses",
    "recommendation"
  ]
}
```
