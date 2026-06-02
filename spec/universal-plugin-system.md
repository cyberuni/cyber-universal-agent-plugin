# Universal Agent Plugin System — Specification

**Status:** Draft v0.1
**Date:** June 2026
**Repo:** cyberuni/cyber-universal-agent-plugin

---

## 1. Problem statement

Major AI coding agent runtimes (Claude Code, Cursor, Codex, GitHub Copilot CLI) each implement their own `plugin.json` manifest at a vendor-specific path. A plugin author who wants to target multiple runtimes must:

- Maintain multiple manifest files that share ~60% of their content
- Hand-write vendor-specific transformations (hook event casing, env var names, component fields)
- Re-sync those files on every change

The open-plugin-spec v1.0.0 proposes `.plugin/plugin.json` as a vendor-neutral fallback, but no vendor confirms it as a primary path, and the spec does not define a build or transform layer.

This system closes that gap: one canonical definition, a structured extension point for vendor-specific needs, and a `build` command that generates each vendor's manifest from it.

---

## 2. Design goals

1. **Single source of truth.** The canonical definition lives only in `.plugin/plugin.json` — never in vendor-specific locations.
2. **open-plugin-spec compatible.** The canonical format is the open-plugin-spec extended, never replaced. A `.plugin/plugin.json` that is also a valid open-plugin-spec document remains valid here.
3. **Vendor-specific by extension.** Vendors to build for are inferred from `vendorExtensions` keys — no separate target declaration needed. An empty `{}` entry opts into a vendor's output with no vendor-specific fields.
4. **Lossless build.** The `build` command generates a complete, spec-conformant vendor manifest for each declared vendor. Generated files are treated as build artifacts — never edited by hand.
5. **Additive, not opinionated.** The system does not dictate plugin content. It only handles the manifest format, transformation rules, and build output. SKILL.md content, hooks logic, and MCP server configuration are the author's concern.

---

## 3. Canonical definition format

The canonical plugin definition extends open-plugin-spec v1.0.0 with one additional top-level field: `vendorExtensions`.

### 3.1 Schema declaration

```json
{
  "$schema": "https://raw.githubusercontent.com/cyberuni/cyber-universal-agent-plugin/refs/heads/main/schema/v1.json"
}
```

The schema URI is the authoritative machine-readable source for this spec. It validates the full canonical format including vendor extensions. The JSON Schema file lives at `schema/v1.json` in this repository.

### 3.2 open-plugin-spec fields (unchanged)

All fields defined by open-plugin-spec v1.0.0 are valid here with identical semantics:

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | Plugin identifier. Kebab-case, 1–64 chars, `a-z 0-9 - .` only |
| `version` | string | no | Semver recommended |
| `description` | string | no | Short description |
| `author` | object | no | `name`, `email`, `url` |
| `homepage` | string | no | URL |
| `repository` | string | no | URL |
| `license` | string | no | SPDX identifier |
| `keywords` | string[] | no | Discovery tags |
| `skills` | path | no | Default: `./skills/` |
| `mcpServers` | path \| object | no | Default: `./.mcp.json` |
| `commands` | path | no | Default: `./commands/` |
| `agents` | path | no | Default: `./agents/` |
| `rules` | path | no | Default: `./rules/` |
| `hooks` | path \| object | no | Default: `./hooks/hooks.json` |
| `lspServers` | path \| object | no | Default: `./.lsp.json` |
| `outputStyles` | path | no | Default: `./output-styles/` |

Path values accept: `string`, `string[]`, or `{ "paths": ["./..."] }` object per the spec.

Env vars in path strings and hook commands use the spec's canonical names: `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`. The build layer translates these to vendor-specific names.

### 3.3 `vendorExtensions` field

Declares which vendor manifests the `build` command should generate, and provides vendor-specific fields for each. Each key is a recognized vendor identifier; its presence drives the build output for that vendor. All fields under a vendor key are merged into that vendor's generated manifest during build.

Recognized vendor identifiers and their output paths:

| Key | Output path | Required manifest fields |
|---|---|---|
| `"claude-code"` | `.claude-plugin/plugin.json` | `name` |
| `"cursor"` | `.cursor-plugin/plugin.json` | `name` |
| `"codex"` | `.codex-plugin/plugin.json` | `name`, `version`, `description` |
| `"copilot-cli"` | `plugin.json` (repo root) | `name` |

An empty `{}` value opts into that vendor's output with no vendor-specific fields. If `vendorExtensions` is absent or empty, `build` is a no-op and emits a warning.

```json
{
  "vendorExtensions": {
    "claude-code": { },
    "cursor": { },
    "codex": { },
    "copilot-cli": { }
  }
}
```

Fields not recognized by the target vendor's schema are emitted with a build warning and included as-is (pass-through). The author is responsible for using only fields the vendor supports.

#### Vendor-specific fields

**`claude-code`:**

| Field | Type | Notes |
|---|---|---|
| `displayName` | string | Human-readable name shown in UI |
| `defaultEnabled` | boolean | Whether plugin is enabled by default |
| `dependencies` | string[] | Inter-plugin dependencies by name |
| `themes` | path | Default: `./themes/` |
| `monitors` | path | Default: `./monitors/monitors.json` |
| `channels` | object[] | MCP channel definitions (`server`, `displayName`, `userConfig`) |
| `userConfig` | object | Prompted at enable time; keys are config item definitions |
| `settings` | object | User settings overrides |

**`cursor`:**

| Field | Type | Notes |
|---|---|---|
| `displayName` | string | Human-readable name |
| `publisher` | string | Publisher/organization name |
| `logo` | string | Path or URL to logo image |
| `category` | string | Marketplace category |
| `tags` | string[] | Filtering/discovery tags |

**`codex`:**

| Field | Type | Notes |
|---|---|---|
| `apps` | path | `.app.json` for connector/app integrations |
| `interface` | object | Marketplace metadata (`displayName`, `shortDescription`, `category`, `websiteURL`) |

**`copilot-cli`:**

| Field | Type | Notes |
|---|---|---|
| `category` | string | Marketplace category |
| `tags` | string[] | Filtering tags |

---

## 4. Hook event name mapping

The canonical `hooks.json` uses PascalCase event names (open-plugin-spec convention). The build layer translates them per vendor.

### 4.1 Canonical event names (source of truth)

```
PreToolUse          PostToolUse         PostToolUseFailure
SessionStart        SessionEnd          UserPromptSubmit
Stop                StopFailure         SubagentStart
SubagentStop        PreCompact          PostCompact
Notification        PermissionRequest   InstructionsLoaded
ConfigChange        CwdChanged          FileChanged
WorktreeCreate      WorktreeRemove      Elicitation
ElicitationResult   TaskCreated         TaskCompleted
TeammateIdle
```

### 4.2 Vendor-specific translations

| Canonical (PascalCase) | `claude-code` | `cursor` | `codex` | `copilot-cli` |
|---|---|---|---|---|
| `PreToolUse` | `PreToolUse` | `preToolUse` | `PreToolUse` | `preToolUse` |
| `PostToolUse` | `PostToolUse` | `postToolUse` | `PostToolUse` | `postToolUse` |
| `PostToolUseFailure` | `PostToolUseFailure` | — | — | — |
| `SessionStart` | `SessionStart` | `sessionStart` | `SessionStart` | `sessionStart` |
| `SessionEnd` | `SessionEnd` | `sessionEnd` | `SessionEnd` | `sessionEnd` |
| `Stop` | `Stop` | — | — | `agentStop` |
| `Notification` | `Notification` | — | — | `notification` |
| `PermissionRequest` | `PermissionRequest` | — | — | `permissionRequest` |
| `UserPromptSubmit` | `UserPromptSubmit` | — | — | — |
| *(others)* | pass-through | drop + warn | drop + warn | drop + warn |

**Rules:**
- Events with a `—` entry are dropped from the generated output for that vendor with a build warning.
- `claude-code` is the most complete target; most canonical events have a direct mapping.
- Vendor-only events (not in the canonical set) may be declared inside `vendorExtensions.<vendor>.hooks` and are emitted only to that vendor's output.

### 4.3 Vendor-only events

Declare events that only one vendor supports inside `vendorExtensions`:

```json
{
  "vendorExtensions": {
    "claude-code": {
      "hooks": {
        "PostToolBatch": [
          { "matcher": ".*", "hooks": [{ "type": "command", "command": "..." }] }
        ]
      }
    }
  }
}
```

Vendor-only hook blocks are merged with the translated canonical hooks in the generated output.

---

## 5. Environment variable mapping

Canonical hook commands and MCP server configs use open-plugin-spec env var names. The build layer substitutes the vendor's actual names in the generated output.

| Canonical | `claude-code` | `cursor` | `codex` | `copilot-cli` |
|---|---|---|---|---|
| `${PLUGIN_ROOT}` | `${CLAUDE_PLUGIN_ROOT}` | *(undocumented — pass-through)* | `${PLUGIN_ROOT}` (native) | *(undocumented — pass-through)* |
| `${PLUGIN_DATA}` | `${CLAUDE_PLUGIN_DATA}` | *(undocumented — pass-through)* | `${PLUGIN_DATA}` (native) | *(undocumented — pass-through)* |

For vendors where the mapping is undocumented, the canonical name is emitted unchanged. Plugin authors who need Cursor-specific or Copilot-specific env var handling should declare those in `vendorExtensions.<vendor>.hooks` using vendor-native names.

---

## 6. Component field mapping

Most component field names are shared across vendors. The build layer handles the exceptions.

### 6.1 Fields present in canonical but not all vendors

| Field | `claude-code` | `cursor` | `codex` | `copilot-cli` |
|---|---|---|---|---|
| `commands` | ✅ emit | ✅ emit | ❌ drop + warn | ✅ emit |
| `agents` | ✅ emit | ✅ emit | ❌ drop + warn | ✅ emit |
| `rules` | ❌ drop + warn | ✅ emit | ❌ drop + warn | ❌ drop + warn |
| `lspServers` | ✅ emit | ❌ drop + warn | ❌ drop + warn | ❌ drop + warn |
| `outputStyles` | ✅ emit | ❌ drop + warn | ❌ drop + warn | ❌ drop + warn |

### 6.2 Required field enforcement

Vendors that require fields beyond `name` receive them from the canonical definition. If missing, the build fails with a validation error (not a warning):

| Vendor | Extra required fields | Build behavior when missing |
|---|---|---|
| `codex` | `version`, `description` | Build error; must be provided in canonical or `vendorExtensions.codex` |
| others | none beyond `name` | n/a |

### 6.3 Vendor-only field injection

Fields that exist only in `vendorExtensions.<vendor>` are injected into that vendor's generated manifest at the top level alongside the canonical fields.

---

## 7. The `build` command

### 7.1 Interface

```
plugin build [--vendor <id>] [--dry-run] [--verbose] [--clean]
```

| Flag | Description |
|---|---|
| *(none)* | Build all vendors declared in `vendorExtensions` |
| `--vendor <id>` | Build only the named vendor |
| `--dry-run` | Print what would be written without writing |
| `--verbose` | Print field-by-field transformation decisions |
| `--clean` | Delete generated manifests before building |

### 7.2 Input

Reads `.plugin/plugin.json` from the current working directory (the plugin root). The file must validate against the canonical schema before any transformation runs.

### 7.3 Validation (pre-build)

1. `name` is present and matches the naming constraint (1–64 chars, `a-z 0-9 - .`, no leading/trailing `-`, no `--` or `..`).
2. All `vendorExtensions` keys are recognized vendor identifiers (unrecognized keys emit a warning, not an error).
3. For `codex`: `version` and `description` are present (in canonical or `vendorExtensions.codex`).
4. All paths declared in component fields start with `./` and do not escape the plugin root with `../`.

### 7.4 Build steps (per vendor)

For each vendor key in `vendorExtensions`:

1. **Start** with the canonical fields (all open-plugin-spec fields from `.plugin/plugin.json`).
2. **Merge** `vendorExtensions.<vendor>` top-level fields into the manifest (vendor fields win on conflict).
3. **Drop** component fields not supported by the vendor (with warning).
4. **Translate** hook event names in `hooks` (inline or referenced file) per the mapping table.
5. **Translate** `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` in hook commands and MCP configs per the mapping table.
6. **Enforce** required fields for the vendor; fail on missing.
7. **Inject** vendor-only hooks from `vendorExtensions.<vendor>.hooks` (merged after canonical hooks).
8. **Write** to the vendor-specific output path.

### 7.5 Output paths

| Vendor | Output |
|---|---|
| `claude-code` | `.claude-plugin/plugin.json` |
| `cursor` | `.cursor-plugin/plugin.json` |
| `codex` | `.codex-plugin/plugin.json` |
| `copilot-cli` | `plugin.json` |

Output files are **build artifacts**. They should be:
- Listed in `.gitignore` if the repo is a plugin source repo (build on install)
- Or committed if the repo is a plugin distribution repo (pre-built for consumers)

The choice is left to the plugin author. The system does not enforce either policy.

### 7.6 Idempotency

Running `build` twice on unchanged input produces identical output files. File timestamps may differ; content must not.

---

## 8. Hooks file handling

### 8.1 Referenced hooks file

When the canonical `hooks` field is a path string (e.g. `"./hooks/hooks.json"`), the build reads that file, transforms it, and writes the transformed version to the vendor output directory:

- `.claude-plugin/hooks/hooks.json`
- `.cursor-plugin/hooks/hooks.json`
- `.codex-plugin/hooks/hooks.json`
- `hooks/hooks.json` (copilot-cli; relative to `plugin.json`)

The original `./hooks/hooks.json` is the canonical source; generated copies are build artifacts.

### 8.2 Inline hooks

When `hooks` is an inline object in `plugin.json`, it is transformed in-place in the generated manifest.

### 8.3 Hook file format (canonical)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "optional-regex",
        "hooks": [
          { "type": "command", "command": "echo 'session started'" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          { "type": "http", "url": "https://example.com/hook" }
        ]
      }
    ]
  }
}
```

---

## 9. MCP server configuration

`.mcp.json` (or inline `mcpServers` in `plugin.json`) is not transformed — MCP server configuration is already portable across all vendors. The build copies or references it unchanged.

`${PLUGIN_ROOT}` and `${PLUGIN_DATA}` substitutions in MCP `command`, `args`, `env`, and `cwd` fields are translated per the env var mapping table.

---

## 10. `.gitignore` recommendations

When treating generated manifests as build artifacts:

```gitignore
# Generated vendor manifests (build artifacts)
.claude-plugin/
.cursor-plugin/
.codex-plugin/
/plugin.json
```

When committing pre-built manifests for distribution, remove these entries.

---

## 11. Canonical file example

```json
{
  "$schema": "https://schema.cyberuni.dev/universal-agent-plugin/v1.json",
  "name": "my-plugin",
  "version": "1.2.0",
  "description": "An example universal agent plugin.",
  "author": { "name": "Example Author", "email": "author@example.com", "url": "https://example.com" },
  "homepage": "https://example.com/my-plugin",
  "repository": "https://github.com/example/my-plugin",
  "license": "MIT",
  "keywords": ["example", "universal"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "commands": "./commands/",
  "agents": "./agents/",
  "rules": "./rules/",
  "hooks": "./hooks/hooks.json",
  "lspServers": "./.lsp.json",
  "outputStyles": "./output-styles/",
  "vendorExtensions": {
    "claude-code": {
      "displayName": "My Plugin",
      "defaultEnabled": false,
      "userConfig": {
        "api_token": {
          "type": "string",
          "title": "API Token",
          "description": "Token for the external API.",
          "sensitive": true,
          "required": false
        }
      },
      "themes": "./themes/",
      "monitors": "./monitors/monitors.json"
    },
    "cursor": {
      "publisher": "example-org",
      "logo": "./assets/logo.png",
      "category": "productivity"
    },
    "codex": {
      "apps": "./.app.json",
      "interface": {
        "displayName": "My Plugin",
        "shortDescription": "An example plugin.",
        "category": "productivity",
        "websiteURL": "https://example.com/my-plugin"
      }
    },
    "copilot-cli": {
      "category": "productivity"
    }
  }
}
```

---

## 12. Canonical hooks file example

`.plugin/hooks/hooks.json` — uses PascalCase event names throughout:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${PLUGIN_ROOT}/scripts/on-session-start.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "http",
            "url": "https://example.com/pre-tool"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${PLUGIN_ROOT}/scripts/post-tool.sh"
          }
        ]
      }
    ]
  }
}
```

Build output for Cursor (`.cursor-plugin/hooks/hooks.json`) translates the same content to:

```json
{
  "hooks": {
    "sessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CURSOR_PLUGIN_ROOT}/scripts/on-session-start.sh"
          }
        ]
      }
    ],
    "preToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "http",
            "url": "https://example.com/pre-tool"
          }
        ]
      }
    ],
    "postToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CURSOR_PLUGIN_ROOT}/scripts/post-tool.sh"
          }
        ]
      }
    ]
  }
}
```

---

## 13. Plugin directory layout

```
my-plugin/
├── .plugin/
│   ├── plugin.json           ← canonical definition (source of truth)
│   └── marketplace.json      ← optional; per open-plugin-spec
├── skills/
│   └── <skill-name>/
│       └── SKILL.md
├── commands/
├── agents/
├── rules/
├── hooks/
│   └── hooks.json            ← canonical hooks (PascalCase events, ${PLUGIN_ROOT})
├── output-styles/
├── themes/                   ← claude-code only; declared in vendorExtensions
├── monitors/
│   └── monitors.json         ← claude-code only
├── assets/
│   └── logo.png
├── scripts/
├── .mcp.json
├── .lsp.json
├── LICENSE
└── README.md
```

Generated build artifacts (when gitignored):

```
my-plugin/
├── .claude-plugin/
│   ├── plugin.json           ← generated
│   └── hooks/hooks.json      ← generated (PascalCase, ${CLAUDE_PLUGIN_ROOT})
├── .cursor-plugin/
│   ├── plugin.json           ← generated
│   └── hooks/hooks.json      ← generated (camelCase, ${CURSOR_PLUGIN_ROOT})
├── .codex-plugin/
│   ├── plugin.json           ← generated
│   └── hooks/hooks.json      ← generated (PascalCase, ${PLUGIN_ROOT})
└── plugin.json               ← generated (copilot-cli root manifest)
```

---

## 14. Relationship to open-plugin-spec

| Aspect | open-plugin-spec | This system |
|---|---|---|
| Canonical manifest path | `.plugin/plugin.json` | same |
| Required field | `name` | same |
| Core component fields | `skills`, `mcpServers` | same |
| Extended component fields | `commands`, `agents`, `rules`, `hooks`, `lspServers`, `outputStyles` | same |
| Env vars | `${PLUGIN_ROOT}`, `${PLUGIN_DATA}` | same (canonical); translated on build |
| Hook event naming | PascalCase | same (canonical); translated on build |
| Vendor extensions | not defined | added (`vendorExtensions`) |
| Build/transform layer | not defined | added (`plugin build` command) |
| Vendor manifest generation | not defined | added |

A `.plugin/plugin.json` that omits `vendorExtensions` is a valid open-plugin-spec document and a valid canonical definition (build is a no-op with a warning). The extension is fully additive.

---

## 15. Open questions and future work

1. **`${CURSOR_PLUGIN_ROOT}` env var name** — Cursor's official docs do not document the env var name for hook scripts. The build currently passes `${PLUGIN_ROOT}` unchanged for Cursor. When Cursor publishes this, the mapping table should be updated.

2. **Copilot CLI env vars** — Same gap as Cursor.

3. **Schema publication** — The `$schema` URI at `https://schema.cyberuni.dev/universal-agent-plugin/v1.json` needs a published JSON Schema file. This should validate both the open-plugin-spec fields and the `vendors`/`vendorExtensions` additions.

4. **`plugin.json` conflict (copilot-cli)** — Copilot CLI generates `plugin.json` at the repo root, which conflicts with `package.json`-adjacent repos. A future `copilot-cli.outputPath` override in `vendorExtensions.copilot-cli` could resolve this.

5. **Windsurf support** — Windsurf does not use a bundle manifest. A future `windsurf` vendor target would need to generate separate SKILL.md-compatible structures and a `hooks.json` with snake_case events rather than a single `plugin.json`.

6. **Zed support** — Zed uses TOML (`extension.toml`), not JSON, and is a different conceptual model (language/tool extensions, not agent plugin bundles). Zed support would require a separate build target with a fundamentally different output format.

7. **Exclude vendors** — A `plugin build --exclude <vendor>` flag could allow opting out of a specific vendor without removing its `vendorExtensions` entry.

8. **Install-time build** — A `plugin install` command that runs `build` after cloning/downloading a plugin, instead of requiring pre-built manifests to be committed.

9. **`open-plugin-spec` marketplace.json** — The spec defines `.plugin/marketplace.json` for marketplace hosts. This system should validate and pass it through unchanged during build.
