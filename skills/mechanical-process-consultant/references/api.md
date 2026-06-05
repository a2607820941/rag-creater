# API Reference

## Manifest

```json
{
  "schemaVersion": "1.0",
  "name": "机械产品工艺咨询专家",
  "slug": "mechanical-process-consultant",
  "version": "0.1.0",
  "description": "基于机械产品工艺知识库，回答关于材料热处理、焊接工艺评定、切削参数等工艺问题，提供具体参数、步骤说明并引用知识库原文",
  "runtime": {
    "type": "http",
    "endpoint": "http://localhost:3000/api/public/skills/mechanical-process-consultant/run",
    "method": "POST"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "用户关于机械产品工艺的具体问题，例如材料热处理、焊接工艺、切削参数等"
      }
    },
    "required": [
      "question"
    ]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "answer": {
        "type": "string",
        "description": "基于知识库的详细回答，包含具体工艺参数、步骤说明等"
      },
      "citations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string",
              "description": "引用的原文片段"
            },
            "source": {
              "type": "string",
              "description": "来源标识"
            }
          }
        },
        "description": "知识库中引用的原文片段列表"
      },
      "confidence": {
        "type": "string",
        "enum": [
          "high",
          "medium",
          "low",
          "not_found"
        ],
        "description": "回答的置信度等级"
      }
    },
    "required": [
      "answer",
      "citations",
      "confidence"
    ]
  },
  "auth": {
    "type": "bearer"
  }
}
```

## Request

```http
POST http://localhost:3000/api/public/skills/mechanical-process-consultant/run
Authorization: Bearer <api-key>
Content-Type: application/json
```

```json
{
  "input": {
  "question": "string"
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
      "id": "cmq0v78wc0005l0vg2xvee5qi",
      "slug": "mechanical-process-consultant",
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
    "question": {
      "type": "string",
      "description": "用户关于机械产品工艺的具体问题，例如材料热处理、焊接工艺、切削参数等"
    }
  },
  "required": [
    "question"
  ]
}
```

## Output Schema

```json
{
  "type": "object",
  "properties": {
    "answer": {
      "type": "string",
      "description": "基于知识库的详细回答，包含具体工艺参数、步骤说明等"
    },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string",
            "description": "引用的原文片段"
          },
          "source": {
            "type": "string",
            "description": "来源标识"
          }
        }
      },
      "description": "知识库中引用的原文片段列表"
    },
    "confidence": {
      "type": "string",
      "enum": [
        "high",
        "medium",
        "low",
        "not_found"
      ],
      "description": "回答的置信度等级"
    }
  },
  "required": [
    "answer",
    "citations",
    "confidence"
  ]
}
```
