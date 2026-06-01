# cyber-universal-agent-plugin

Research and design project for a universal AI coding agent plugin — a single plugin bundle that works across Claude Code, Cursor, Codex, GitHub Copilot CLI, and other major runtimes.

## Status

**Research phase.** No plugin code exists yet. The primary artifact is `.research/` — structured findings on plugin schema formats and cross-vendor compatibility.

## The problem

Every major AI coding agent runtime has its own plugin manifest format:

| Runtime | Manifest path | Required fields |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` | `name` |
| Cursor | `.cursor-plugin/plugin.json` | `name` |
| Codex | `.codex-plugin/plugin.json` | `name`, `version`, `description` |
| GitHub Copilot CLI | `plugin.json` in plugin root | `name` |

There is no single file that all four runtimes load as their primary configuration. Hook event naming is not standardized (PascalCase vs camelCase vs snake_case). Env var names differ per vendor.

## The real universal minimum

Despite manifest fragmentation, two things work everywhere:

1. **`skills/<name>/SKILL.md`** — every Tier 1 runtime reads this path.
2. **MCP servers** (`.mcp.json` / `mcpServers`) — every active runtime supports MCP integration.

A viable "universal plugin" strategy generates or symlinks the four vendor-specific manifest files from a single source of truth at install/sync time, rather than relying on a shared path.

## open-plugin-spec

[open-plugin-spec](https://github.com/vercel-labs/open-plugin-spec) v1.0.0 is the closest thing to a cross-vendor standard. Its metadata fields (`name`, `version`, `description`, `author`, `homepage`, `repository`, `license`) and core component names (`commands`, `agents`, `hooks`, `mcpServers`) align with what Claude Code and Cursor actually implement.

However, three of its central premises are contradicted by vendor reality:

- **`.plugin/plugin.json` as shared path** — only Copilot CLI confirms searching it; all others use vendor-specific paths.
- **PascalCase hook events as the standard** — Cursor and Copilot CLI use camelCase; Windsurf uses snake_case.
- **`${PLUGIN_ROOT}` / `${PLUGIN_DATA}` env vars** — only Codex matches these exactly; Claude Code uses vendor-prefixed names.

Alignment ranges from ~70% (Claude Code) down to ~5% (Cline). See `.research/open-plugin-spec-comparison/conclusion.md` for the full field-by-field analysis.

## Research

| Topic | Slug | Read first |
| --- | --- | --- |
| Plugin schema survey | `plugin-schema` | `.research/plugin-schema/conclusion.md` |
| open-plugin-spec comparison | `open-plugin-spec-comparison` | `.research/open-plugin-spec-comparison/conclusion.md` |

Each topic has four files: `conclusion.md` (current best answer), `topic.md` (full investigation), `evidence.md` (structured claims log), `changes.md` (update history).
