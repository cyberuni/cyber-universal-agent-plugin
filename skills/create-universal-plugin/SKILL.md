---
name: create-universal-plugin
description: Use this skill when creating a universal agent plugin. Guides vendor choice and scaffolds canonical plugin.json.
---

# Create Universal Plugin

## When to use

When the user wants to build a plugin that targets multiple AI coding agent runtimes.

## Prerequisites

Load governance before starting:

```bash
npx cyber-skills governance show plugin-design
```

Read the output — it is the authoritative source for component selection rules and anti-patterns.

## Step 1 — Gather plugin identity

Ask if not provided. All fields map to the canonical `plugin.json`.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | lowercase alphanumeric + hyphens, max 64 chars |
| `description` | Recommended | one sentence; Codex requires this |
| `version` | If publishing | semver; Codex requires this |
| `author.name` | Recommended | person or org name |
| `homepage` | Optional | docs or landing page URL |
| `repository` | Optional | source repo URL |
| `license` | Optional | SPDX identifier e.g. `MIT` |
| `keywords` | Optional | discovery tags; array of strings |

## Step 2 — Choose vendor targets

Ask the user which runtimes to support. Record as the `vendors` array.

| Vendor ID | Manifest path | Hook event case | Required fields beyond `name` |
|-----------|--------------|-----------------|-------------------------------|
| `claude-code` | `.claude-plugin/plugin.json` | PascalCase | none |
| `cursor` | `.cursor-plugin/plugin.json` | camelCase | none |
| `codex` | `.codex-plugin/plugin.json` | PascalCase | `version`, `description` |
| `copilot-cli` | `plugin.json` at plugin root | camelCase | none |

Universal minimum (no vendor manifest needed): `skills/<name>/SKILL.md` + `.mcp.json`.

Default to all four if the user is unsure.

## Step 3 — Choose components

Infer from context; ask only if ambiguous. Apply rules from the `plugin-design` governance loaded in Prerequisites.

| Component | Field | Directory | Cross-vendor? |
|-----------|-------|-----------|--------------|
| Skills | `skills` | `skills/<name>/SKILL.md` | Yes — all |
| Commands | `commands` | `commands/<name>.md` | Claude Code, Cursor, Copilot CLI |
| Agents | `agents` | `agents/<name>.md` | Claude Code, Cursor, Copilot CLI |
| MCP servers | `mcpServers` | `.mcp.json` | Yes — all |
| Hooks | `hooks` | `hooks/hooks.json` | Partial — event names translated on build |
| Rules | `rules` | `rules/<name>.mdc` | Cursor-only |
| LSP servers | `lspServers` | `.lsp.json` | Claude Code, Cursor |
| Output styles | `outputStyles` | `output-styles/` | Claude Code only |

## Step 4 — Scaffold files

Read the templates from the plugin's `assets/templates/` directory and fill in the placeholders:

| File to create | Template |
|----------------|----------|
| `plugin.json` | `assets/templates/plugin.json` |
| `skills/<name>/SKILL.md` | `assets/templates/skill.md` |
| `commands/<name>.md` | `assets/templates/command.md` |
| `agents/<name>.md` | `assets/templates/agent.md` |
| `hooks/hooks.json` | `assets/templates/hooks.json` |
| `commands/setup.md` (when `rules/` included) | `assets/templates/setup-command.md` |

Directory layout:

```
<plugin-name>/
├── plugin.json
├── skills/<name>/SKILL.md
├── commands/
├── agents/
├── rules/            (only if always-on Cursor guidance requested)
├── hooks/hooks.json
├── .mcp.json
└── README.md
```

## Step 5 — Add vendor extensions

For each vendor in `vendors`, add marketplace or vendor-specific fields. See spec section 3.3 for field references:
https://github.com/cyberuni/cyber-universal-agent-plugin/blob/main/spec/universal-plugin-system.md

Common fields:
- Cursor: `publisher`, `logo`, `category`, `tags`
- Codex: `apps`, `interface.displayName`, `interface.category`, `interface.websiteURL`
- Copilot CLI: `category`, `tags`

## Step 6 — Audit skills

```bash
npx cyber-skills audit validate --path skills/<skill-name>
```

Fix any CRITICAL findings. Then invoke the **audit-skill** skill for full review.

## Step 7 — Build vendor manifests

```bash
npx cyber-universal-agent-plugin build
```

Until the CLI exists, generate manually: strip `$schema`, `vendors`, `vendorExtensions` from canonical; add Codex-required fields; flatten for Copilot CLI. See spec section 7 for full build rules.

## Step 8 — Install locally for testing

```bash
ln -sf "$(pwd)" ~/.claude/plugins/local/<plugin-name>   # Claude Code
ln -sf "$(pwd)" ~/.cursor/plugins/local/<plugin-name>   # Cursor → Developer: Reload Window
```

## References

- Governance: `npx cyber-skills governance show plugin-design`
- Spec: https://github.com/cyberuni/cyber-universal-agent-plugin/blob/main/spec/universal-plugin-system.md
- Schema: https://raw.githubusercontent.com/cyberuni/cyber-universal-agent-plugin/refs/heads/main/schema/v1.json
- Examples: https://github.com/cyberuni/cyber-universal-agent-plugin/tree/main/examples
