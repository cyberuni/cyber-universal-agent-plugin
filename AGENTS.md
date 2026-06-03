# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Feature Planning

Use GitHub issues for feature planning by default. At the end of a brainstorming or design session, create a GitHub issue (via the `create-issue` skill) to capture the spec. Reference the issue number when resuming work in a future conversation.

## Commit Discipline

**Auto-commit rule:** When a unit of work is complete and verified, commit it immediately — do not wait for the user to ask. Batching multiple units into one commit, or finishing all work before committing, are both violations of this rule.

**Unit of work:** one coherent, independently revertable change — one domain's refactor, one feature, one bugfix, one test suite expansion for one concern, one config change. Never two unrelated concerns in the same commit. A TDD red-green-refactor cycle alone is not a commit boundary; commit when the full intended change is complete and tests pass. If the working tree has unrelated changes, leave them unstaged — commit the current unit first, then continue.

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- One concern per commit; never batch unrelated changes
- Stage only files for this unit: `git add <files>`, then verify with `git diff --cached`
- Never use `git add .`, `git add -A`, or `git add -p` (interactive commands agents cannot run)
- Never commit with red tests; run validation commands first

### References

- **`commit-work` skill** — staging, splitting, and message writing when committing

## Project overview

`cyber-universal-agent-plugin` is a research and design project for a universal AI coding agent plugin — a single plugin bundle that works across Claude Code, Cursor, Codex, GitHub Copilot CLI, and other major runtimes.

The project is currently in the **research and design phase**. No plugin code or skills have been written yet. The primary artifact is `.research/` — structured research notes on plugin schema formats and the open-plugin-spec.

## Research structure

Research lives in `.research/<topic-slug>/` with four files per topic:

- `conclusion.md` — read this first; the current best answer
- `topic.md` — full investigation record with findings and source angles
- `evidence.md` — structured claims log with confidence and source URLs
- `changes.md` — dated update history

Current research topics:

| Topic | Slug | Summary |
| --- | --- | --- |
| Plugin schema survey | `plugin-schema` | What each major runtime implements for plugin manifests; which ones publish JSON Schema URLs |
| open-plugin-spec comparison | `open-plugin-spec-comparison` | Field-by-field diff of open-plugin-spec v1.0.0 against Claude Code, Cursor, Codex, Copilot CLI, Windsurf, Zed, Continue.dev, and Cline |

## Key research findings (summary)

- **No universal plugin manifest exists.** Each Tier 1 runtime (Claude Code, Cursor, Codex, Copilot CLI) uses a vendor-specific `plugin.json` path.
- **The real universal minimum is `skills/<name>/SKILL.md` + MCP servers.** Every active runtime supports these.
- **Hook event naming is the most concrete incompatibility:** Claude Code and Codex use PascalCase; Cursor and Copilot CLI use camelCase; Windsurf uses snake_case.
- **Only Claude Code and Cursor publish machine-readable JSON Schemas** at stable authoritative URLs.
- **open-plugin-spec v1.0.0** is the closest thing to a standard but no vendor confirms `.plugin/plugin.json` as a primary search path except Copilot CLI as a fallback.

See `.research/open-plugin-spec-comparison/conclusion.md` and `.research/plugin-schema/conclusion.md` for the full verdicts.
