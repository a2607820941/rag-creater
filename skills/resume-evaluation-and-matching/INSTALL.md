# Install

This folder is a portable Skill package for Claude Code and Codex-compatible Skill workflows.

## One-Command Install

From this Skill folder, run one of:

```bash
node scripts/install-skill.mjs codex
node scripts/install-skill.mjs claude-code
```

By default, the installer copies this folder to:

- Codex: `$CODEX_HOME/skills/resume-evaluation-and-matching`, or `~/.codex/skills/resume-evaluation-and-matching` when `CODEX_HOME` is not set.
- Claude Code: `$CLAUDE_HOME/skills/resume-evaluation-and-matching`, or `~/.claude/skills/resume-evaluation-and-matching` when `CLAUDE_HOME` is not set.

To install somewhere else:

```bash
node scripts/install-skill.mjs codex --target /path/to/skills/resume-evaluation-and-matching
node scripts/install-skill.mjs claude-code --target /path/to/skills/resume-evaluation-and-matching
```

## Runtime API Key

This Skill calls the platform runtime. After publishing, copy the one-time API key shown by the platform.

### Recommended: store the key in this installed Skill folder

Use this when Codex or Claude Code is already running, or when you use a desktop app. Shell `export` commands only affect the current terminal process and child processes launched from it; an already-running agent app will not see them.

After installing the Skill, run this inside the installed Skill folder:

```bash
node scripts/set-runtime-key.mjs "<api-key>"
node scripts/run-skill.mjs '{"question":"What should I know?"}'
```

Default installed folders:

```bash
cd ~/.codex/skills/resume-evaluation-and-matching
node scripts/set-runtime-key.mjs "<api-key>"

cd ~/.claude/skills/resume-evaluation-and-matching
node scripts/set-runtime-key.mjs "<api-key>"
```

The setup script writes a local `.skill-runtime.json` file with owner-only permissions when possible. Do not commit or share that file.

### Temporary terminal-only setup

Use this only when the same terminal launches the process that will call the Skill:

```bash
export SKILL_API_KEY="<api-key>"
node scripts/run-skill.mjs '{"question":"What should I know?"}'
```

The generated package does not store the plaintext API key by default.

## What Agents Should Read

1. Start with `SKILL.md`.
2. Read `references/task-scenario.md` to decide whether this Skill fits the request.
3. Read `references/api.md` before calling the runtime.
4. Use `scripts/run-skill.mjs` when local script execution is available.
