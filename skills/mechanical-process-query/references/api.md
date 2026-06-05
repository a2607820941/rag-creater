# API Reference

## Manifest

```json
{
  "schemaVersion": "1.0",
  "name": "机械产品工艺查询",
  "slug": "mechanical-process-query",
  "version": "0.1.0",
  "description": "基于机械产品工艺知识库，查询工艺参数、规范标准、材料选择建议和加工流程步骤。当知识库中无相关信息时返回空结果。",
  "runtime": {
    "type": "http",
    "endpoint": "http://localhost:3000/api/public/skills/mechanical-process-query/run",
    "method": "POST"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "用户关于机械产品工艺的查询问题，例如：焊接温度、切削速度、工艺规范、材料选择、加工流程等"
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
        "description": "基于知识库的工艺查询答案，如果未找到相关信息则返回空字符串"
      }
    },
    "required": [
      "answer"
    ]
  },
  "auth": {
    "type": "bearer"
  }
}
```

## Request

```http
POST http://localhost:3000/api/public/skills/mechanical-process-query/run
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
      "id": "cmq0iodl200097svg1qwg3h11",
      "slug": "mechanical-process-query",
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
      "description": "用户关于机械产品工艺的查询问题，例如：焊接温度、切削速度、工艺规范、材料选择、加工流程等"
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
      "description": "基于知识库的工艺查询答案，如果未找到相关信息则返回空字符串"
    }
  },
  "required": [
    "answer"
  ]
}
```
