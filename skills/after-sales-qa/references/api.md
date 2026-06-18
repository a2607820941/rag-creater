# API Reference

## Runtime Contract

```json
{
  "type": "http",
  "mode": "platform_rag",
  "endpoint": "http://localhost:3000/api/public/skills/after-sales-qa/run",
  "method": "POST",
  "auth": {
    "type": "bearer"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "用户提出的售后问题"
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
        "description": "基于知识库的售后问题解答"
      },
      "citations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": {
              "type": "string"
            },
            "content": {
              "type": "string"
            }
          }
        },
        "description": "答案引用的知识库原文片段"
      },
      "needs_human": {
        "type": "boolean",
        "description": "是否需要转接人工客服（当知识库无法解答时）"
      }
    },
    "required": [
      "answer",
      "citations",
      "needs_human"
    ]
  }
}
```

## Request

```http
POST http://localhost:3000/api/public/skills/after-sales-qa/run
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
      "id": "cmqiv098700as90vby0x7566r",
      "slug": "after-sales-qa",
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
      "description": "用户提出的售后问题"
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
      "description": "基于知识库的售后问题解答"
    },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string"
          },
          "content": {
            "type": "string"
          }
        }
      },
      "description": "答案引用的知识库原文片段"
    },
    "needs_human": {
      "type": "boolean",
      "description": "是否需要转接人工客服（当知识库无法解答时）"
    }
  },
  "required": [
    "answer",
    "citations",
    "needs_human"
  ]
}
```
