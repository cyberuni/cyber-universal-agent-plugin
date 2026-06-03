---
name: create-universal-plugin
description: Use this skill when creating a universal agent plugin. Guides vendor choice and scaffolds canonical plugin.json.
---

# Create Universal Plugin

## When to use

When the user wants to build a plugin, extension, or skill pack that targets multiple AI coding agent runtimes.

## Step 1 — Gather plugin identity

Ask if not provided. All fields map to the canonical `plugin.json`.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | lowercase alphanumeric + hyphens, max 64 chars |
| `description` | Recommended | one sentence; shown in marketplace listings |
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

**Universal minimum** (works everywhere, no vendor manifest needed): `skills/<name>/SKILL.md` + `.mcp.json`.

If the user is unsure, default to all four Tier 1 vendors and let the build filter.

## Step 3 — Choose components

Infer from context; ask only if ambiguous.

| Component | Field | Directory | Cross-vendor? | Notes |
|-----------|-------|-----------|--------------|-------|
| Skills | `skills` | `skills/<name>/SKILL.md` | Yes — all | Most portable component |
| Commands | `commands` | `commands/<name>.md` | Partial | Claude Code, Cursor, Copilot CLI; not Codex |
| Agents | `agents` | `agents/<name>.md` | Partial | Claude Code, Cursor, Copilot CLI; not Codex |
| MCP servers | `mcpServers` | `.mcp.json` | Yes — all | Primary cross-vendor integration layer |
| Hooks | `hooks` | `hooks/hooks.json` | Partial | Event names differ per vendor; build translates |
| Rules | `rules` | `rules/<name>.mdc` | No | Cursor-only always-on injection |
| LSP servers | `lspServers` | `.lsp.json` | Partial | Claude Code, Cursor only |
| Output styles | `outputStyles` | `output-styles/` | Partial | Claude Code only |

**Rules note:** rules are always-on and Cursor-only. For cross-vendor always-on guidance, use `AGENTS.md` (all agents read it). Scaffold `commands/setup.md` to merge rule content into `AGENTS.md` when rules are included.

## Step 4 — Scaffold the directory

```
<plugin-name>/
├── plugin.json                  ← canonical source (this schema)
├── skills/
│   └── <skill-name>/
│       └── SKILL.md
├── commands/
│   └── <cmd-name>.md
├── agents/
│   └── <agent-name>.md
├── rules/
│   └── <rule-name>.mdc          (only if always-on Cursor guidance requested)
├── hooks/
│   ├── hooks.json               (PascalCase canonical; build translates per vendor)
│   └── <impl>.sh                (shared logic)
├── .mcp.json                    (MCP config source of truth)
└── README.md
```

**Canonical `plugin.json`** (place at plugin root):

```json
{
  "$schema": "https://raw.githubusercontent.com/cyberuni/cyber-universal-agent-plugin/refs/heads/main/schema/v1.json",
  "name": "<plugin-name>",
  "version": "1.0.0",
  "description": "<description>",
  "author": { "name": "<author>" },
  "vendors": ["claude-code", "cursor", "codex", "copilot-cli"],
  "skills": "./skills/",
  "commands": "./commands/",
  "agents": "./agents/",
  "mcpServers": "./.mcp.json",
  "hooks": "./hooks/hooks.json",
  "vendorExtensions": {}
}
```

Omit any component field not used. Omit `vendors` if targeting all four defaults.

## Step 5 — Populate templates

**Skill (`skills/<name>/SKILL.md`):**
```markdown
---
name: <skill-name>
description: Use this skill when <trigger>. <One-line summary.>
---

# <Title>

## When to use
<conditions>

## Instructions
1. First step
2. Second step
```

**Command (`commands/<name>.md`):**
```markdown
---
description: <Short description shown in help>
argument-hint: [optional-arg]
allowed-tools: [Read, Bash]
---
# <Command Title>
<instructions>
```

**Agent (`agents/<name>.md`):**
```markdown
---
name: <agent-name>
description: Use this agent to <when to invoke>.
model: sonnet
---
<agent instructions>
```

**Hooks (`hooks/hooks.json`) — write in PascalCase; build translates:**
```json
{
  "description": "<plugin-name> hooks",
  "hooks": {
    "PreToolUse": [
      { "type": "command", "command": "./hooks/<impl>.sh", "timeout": 10 }
    ],
    "PostToolUse": [],
    "Stop": [],
    "UserPromptSubmit": []
  }
}
```

**MCP (`.mcp.json`):**
```json
{
  "mcpServers": {
    "<server-name>": {
      "type": "http",
      "url": "https://...",
      "headers": {}
    }
  }
}
```

**Setup command (`commands/setup.md`) — required when `rules/` is included:**
```markdown
---
description: Post-install setup — merge always-on plugin guidance into project AGENTS.md
---
# Plugin Setup

Run once after installing the plugin.

## Instructions

1. Read all `.mdc` files under this plugin's `rules/` directory
2. Strip YAML frontmatter from each file
3. Append the remaining content as a new `## <plugin-name>` section in the project's `AGENTS.md`
4. Confirm the merge completed
5. The `rules/*.mdc` files are now redundant. Delete them if desired.
```

## Step 6 — Add vendor extensions

For each vendor in `vendors`, add marketplace or vendor-specific fields under `vendorExtensions`:

**Cursor:**
```json
"cursor": {
  "publisher": "<handle>",
  "logo": "./assets/logo.png",
  "category": "productivity",
  "tags": ["<tag>"]
}
```

**Codex:**
```json
"codex": {
  "apps": "./.app.json",
  "interface": {
    "displayName": "<Name>",
    "shortDescription": "<Short description>",
    "category": "productivity",
    "websiteURL": "https://..."
  }
}
```

**Copilot CLI:**
```json
"copilot-cli": {
  "category": "productivity",
  "tags": ["<tag>"]
}
```

## Step 7 — Audit skills

```bash
npx cyber-skills audit validate --path skills/<skill-name>
```

Fix any CRITICAL findings. Then invoke the **audit-skill** skill for full review.

## Step 8 — Build vendor manifests

```bash
npx cyber-universal-agent-plugin build
```

This reads `plugin.json`, translates hook event names per vendor, and generates:
- `.claude-plugin/plugin.json`
- `.cursor-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `plugin.json` (Copilot CLI at plugin root — overwrites canonical; keep canonical in source control as `plugin.json.source` or a dedicated build step)

Until the build CLI exists, generate manifests manually from `plugin.json` using these rules:
- Codex: add `version` and `description` as top-level required fields
- Copilot CLI: flatten — output just `{ "name", "description", "version", "author" }` + any `vendorExtensions.copilot-cli` fields
- All: strip `$schema`, `vendors`, `vendorExtensions`

## Step 9 — Install locally for testing

```bash
# Claude Code
ln -sf "$(pwd)" ~/.claude/plugins/local/<plugin-name>

# Cursor
ln -sf "$(pwd)" ~/.cursor/plugins/local/<plugin-name>
# Then: Cursor → Developer: Reload Window
```

## Anti-patterns

- Never write hook events in vendor-specific casing in `hooks/hooks.json` — use PascalCase canonical names only; the build translates
- Never use `rules/` for guidance that needs to work in Claude Code — use `AGENTS.md` instead
- Never commit `.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/` as hand-edited files — they are build outputs
- Never skip `commands/setup.md` when shipping `rules/` — Cursor users need the merge path for Claude Code compat

## References

- Schema: https://raw.githubusercontent.com/cyberuni/cyber-universal-agent-plugin/refs/heads/main/schema/v1.json
- Examples: https://github.com/cyberuni/cyber-universal-agent-plugin/tree/main/examples
- Research conclusions: https://github.com/cyberuni/cyber-universal-agent-plugin/tree/main/.research
