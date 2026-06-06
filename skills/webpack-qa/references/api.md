# API Reference

## Runtime Contract

```json
{
  "type": "http",
  "mode": "platform_rag",
  "endpoint": "http://localhost:3000/api/public/skills/webpack-qa/run",
  "method": "POST",
  "auth": {
    "type": "bearer"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "用户关于 Webpack 的提问"
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
        "description": "基于知识库的 Webpack 问题回答，包含引用标记"
      },
      "citations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": {
              "type": "string",
              "description": "知识库来源名称"
            },
            "content": {
              "type": "string",
              "description": "引用的具体内容片段"
            }
          }
        },
        "description": "回答中引用的知识库来源列表"
      },
      "hasAnswer": {
        "type": "boolean",
        "description": "是否成功从知识库中找到答案"
      },
      "errorMessage": {
        "type": "string",
        "description": "当 hasAnswer 为 false 时，说明无法回答的原因"
      }
    },
    "required": [
      "answer",
      "citations",
      "hasAnswer"
    ]
  }
}
```

## Request

```http
POST http://localhost:3000/api/public/skills/webpack-qa/run
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
      "id": "cmq1xzows002poraxuz8szcwv",
      "slug": "webpack-qa",
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
      "description": "用户关于 Webpack 的提问"
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
      "description": "基于知识库的 Webpack 问题回答，包含引用标记"
    },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string",
            "description": "知识库来源名称"
          },
          "content": {
            "type": "string",
            "description": "引用的具体内容片段"
          }
        }
      },
      "description": "回答中引用的知识库来源列表"
    },
    "hasAnswer": {
      "type": "boolean",
      "description": "是否成功从知识库中找到答案"
    },
    "errorMessage": {
      "type": "string",
      "description": "当 hasAnswer 为 false 时，说明无法回答的原因"
    }
  },
  "required": [
    "answer",
    "citations",
    "hasAnswer"
  ]
}
```
