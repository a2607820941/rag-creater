# API Reference

## Runtime Contract

```json
{
  "type": "http",
  "mode": "platform_rag",
  "endpoint": "http://localhost:3000/api/public/skills/webpack-qa-2/run",
  "method": "POST",
  "auth": {
    "type": "bearer"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The concrete user question or task request."
      },
      "context": {
        "type": "string",
        "description": "Optional caller-provided context that is not a knowledge-base citation."
      },
      "outputStyle": {
        "type": "string",
        "description": "Optional preferred response style, such as concise, checklist, step_by_step, risk_report, or json."
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
        "description": "The knowledge-grounded answer for the configured task scenario."
      },
      "citations": {
        "type": "array",
        "description": "Knowledge-base citations returned by the runtime."
      },
      "confidence": {
        "type": "string",
        "enum": [
          "high",
          "medium",
          "low"
        ],
        "description": "Evidence confidence based on retrieved knowledge coverage."
      },
      "followups": {
        "type": "array",
        "description": "Optional missing information, next questions, or recommended owner/process."
      }
    },
    "required": [
      "answer",
      "citations",
      "confidence"
    ]
  }
}
```

## Request

```http
POST http://localhost:3000/api/public/skills/webpack-qa-2/run
Authorization: Bearer <api-key>
Content-Type: application/json
```

```json
{
  "input": {
  "question": "string",
  "context": "string",
  "outputStyle": "string"
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
      "id": "cmq1y6f8j002uoraxbr3hv5au",
      "slug": "webpack-qa-2",
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
      "description": "The concrete user question or task request."
    },
    "context": {
      "type": "string",
      "description": "Optional caller-provided context that is not a knowledge-base citation."
    },
    "outputStyle": {
      "type": "string",
      "description": "Optional preferred response style, such as concise, checklist, step_by_step, risk_report, or json."
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
      "description": "The knowledge-grounded answer for the configured task scenario."
    },
    "citations": {
      "type": "array",
      "description": "Knowledge-base citations returned by the runtime."
    },
    "confidence": {
      "type": "string",
      "enum": [
        "high",
        "medium",
        "low"
      ],
      "description": "Evidence confidence based on retrieved knowledge coverage."
    },
    "followups": {
      "type": "array",
      "description": "Optional missing information, next questions, or recommended owner/process."
    }
  },
  "required": [
    "answer",
    "citations",
    "confidence"
  ]
}
```
