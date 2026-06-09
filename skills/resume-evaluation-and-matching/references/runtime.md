# Runtime

## Runtime Mode

platform_rag

This package is designed for Claude Code and Codex compatible Skill folder workflows. It delegates execution to the platform RAG runtime:

- Endpoint: `http://localhost:3000/api/public/skills/resume-evaluation-and-matching/run`
- Method: `POST`
- Auth: Bearer token

## Optional Script

Use `scripts/run-skill.mjs` when the agent can execute local Node.js scripts.

```bash
node scripts/set-runtime-key.mjs "<api-key>"
node scripts/run-skill.mjs '{"question":"What should I know?"}'
```

The setup command stores the key in this installed Skill folder. This is recommended for desktop apps or already-running agent processes.

For a temporary terminal-only setup:

```bash
SKILL_API_KEY="<api-key>" node scripts/run-skill.mjs '{"question":"What should I know?"}'
```

Use `scripts/install-skill.mjs` to copy this package into Codex or Claude Code:

```bash
node scripts/install-skill.mjs codex
node scripts/install-skill.mjs claude-code
```

## Runtime Behavior

1. The runtime extracts a question from the JSON input.
2. It retrieves context from the configured knowledge scope.
3. It applies the Skill task scenario and system prompt.
4. It returns an answer with citations when supporting evidence exists.

## Safety Boundaries

For security, privacy, compliance, legal, finance, procurement, approval, and HR matters, treat returned answers as knowledge-grounded assistance. Do not present them as final approvals, legal opinions, policy exceptions, or completed business actions unless the runtime evidence explicitly supports that.
