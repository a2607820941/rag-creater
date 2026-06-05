# API Reference

## Manifest

```json
{
  "schemaVersion": "1.0",
  "name": "机械产品工艺顾问验证 Skill",
  "slug": "mechanical-process-advisor-e2e",
  "version": "0.1.0",
  "description": "当用户询问机械产品制造工艺、加工步骤、工艺要求或工艺知识时使用，基于机械产品工艺知识库回答并返回引用。",
  "runtime": {
    "type": "http",
    "endpoint": "http://localhost:3000/api/public/skills/mechanical-process-advisor-e2e/run",
    "method": "POST"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string"
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
        "type": "string"
      },
      "citations": {
        "type": "array"
      }
    }
  },
  "auth": {
    "type": "bearer"
  }
}
```

## Request

```http
POST http://localhost:3000/api/public/skills/mechanical-process-advisor-e2e/run
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
      "id": "cmpzlgbop0000ecvgfx11z8qs",
      "slug": "mechanical-process-advisor-e2e",
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
      "type": "string"
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
      "type": "string"
    },
    "citations": {
      "type": "array"
    }
  }
}
```
