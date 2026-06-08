# Plugin Asset Resolution Design

**Date:** 2026-06-07
**Status:** Approved
**Relates to:** `docs/superpowers/specs/2026-06-07-uni-plugin-sync-design.md`, GitHub Discussion #6

---

## Problem

Skills, commands, and agent instructions need to load named assets (governances, disciplines, guidelines, templates) from plugins by name. Today there is no vendor-neutral way to do this:

- Each vendor installs plugins to its own isolated cache (`~/.claude/plugins/`, `~/.cursor/extensions/`, etc.)
- A subprocess like `npx uni-plugin governance show` has no reliable way to detect which vendor invoked it — only Claude Code and Codex set detectable env vars; Cursor and Copilot CLI document nothing
- Even with vendor detection, vendor caches may not expose raw plugin files (sandboxing, encryption, proprietary formats)
- Flat governance names (`governance show plugin-design`) will collide as unrelated plugins ship same-named assets

---

## Design

### Plugin asset store

`uni-plugin` owns a vendor-neutral, versioned flat store modelled on pnpm's content store:

```
~/.agents/.uni-plugin/plugins/          ← global scope
  npm/
    uni-plugin@1.2.3/
      governances/
      disciplines/
      guidelines/
      templates/
    @cyberuni/uni-plugin@1.2.3/
  github.com/
    cyberuni/uni-plugin@1.2.3/
      governances/
  gitlab.com/
    org/repo@1.2.3/
  github.mycompany.com/                 ← registered custom instance
    org/repo@1.2.3/
  url/
    uni-plugin-a3f9b2c1@1.2.3/         ← unrecognized hosts: <name>-<sha8>@<version>

.agents/.uni-plugin/plugins/            ← project scope (repo-relative)
```

Paths inside the store are relative (`~` for global, repo-root for project). Store entries are immutable per version — `prepare` skips population if `<source>/<plugin>@<version>/` already exists.

### Asset types

All asset types are Markdown files consumed on-demand by skills, commands, or AGENTS.md instructions.

| Type | Purpose |
|---|---|
| `governances/` | Principles the agent should follow (e.g. screaming architecture) |
| `disciplines/` | Steps and processes the agent should follow (e.g. always plan first, follow TDD) |
| `guidelines/` | Criteria the agent should maintain (e.g. code coverage ≥ 95%) |
| `templates/` | Scaffolding templates |

Skills and commands are excluded — those are handled by vendor plugin installation, not this store.

### Asset namespace

Three tiers, matching the governance namespace RFC (Discussion #6):

| Tier | Format | Resolves from |
|---|---|---|
| Ambient | `plugin-name/asset-name` | `assets` index in state JSON → store path |
| Source-pinned | `npm:plugin-name/asset-name` | Store directly, no scope shadowing |
| Version-pinned | `npm:plugin-name@1.2.3/asset-name` | Exact version in store |

`owner/repo` shorthand (e.g. `cyberuni/cyber-asana`) defaults to the first registered `github` handler host — `github.com` by default, configurable.

### Source handler registry

Source types are registered, not hardcoded. Built-in defaults:

```json
// ~/.agents/.uni-plugin/sources.json
{
  "handlers": {
    "github": { "hosts": ["github.com"] },
    "gitlab": { "hosts": ["gitlab.com"] },
    "npm":    { "registries": ["https://registry.npmjs.org"] }
  }
}
```

Users extend for self-hosted instances:

```json
{
  "handlers": {
    "github": { "hosts": ["github.com", "github.mycompany.com"] },
    "gitlab": { "hosts": ["gitlab.com", "gitlab.mycompany.com"] }
  }
}
```

Handler type determines fetch protocol only. Store path always uses the actual hostname. Unrecognized hosts fall through to `url/<name>-<sha8>@<version>/` where `sha8` is the first 8 hex chars of SHA-256 of the full URL.

### State JSON additions

Two new top-level keys in `~/.agents/uni-plugin.json`:

```json
{
  "plugins": {
    "claude-code": {
      "uni-plugin": { "source": "npm", "path": "~/.claude/plugins/uni-plugin", "version": "1.2.3" }
    },
    "cursor": {
      "uni-plugin": { "source": "npm", "path": "~/.cursor/extensions/uni-plugin", "version": "1.2.3" }
    }
  },
  "assets": {
    "uni-plugin": { "source": "npm", "version": "1.2.3" }
  }
}
```

- `plugins.<vendor>` — vendor-keyed index, written by `prepare` for the current vendor on each run. Records source, vendor cache path, and version. Used by sync.
- `assets.<plugin-name>` — vendor-neutral index, written by `prepare`. Points to which store entry to use for ambient resolution. Last-write wins across vendors; sync keeps versions converging so divergence is transient.

Project scope uses the same structure in `.agents/uni-plugin.json` with repo-relative paths.

### `prepare` changes

`prepare` already scans the current vendor's installed plugins via the `globalManifest` glob. Additional steps:

1. For each discovered plugin manifest, derive plugin root by stripping `pluginRootSuffix` from the manifest path (new field in vendor registry — see below)
2. Read `source` and `version` from the manifest
3. Write `plugins.<vendor-id>.<plugin-name>` to state JSON
4. Write `assets.<plugin-name>` to state JSON
5. Populate the asset store:
   a. Try copying asset directories (`governances/`, `disciplines/`, `guidelines/`, `templates/`) from vendor cache path — fast, no network
   b. If vendor cache assets are unavailable or incomplete, fetch from plugin source using the registered handler
   c. Skip if `<source>/<plugin>@<version>/` already exists in store

### Vendor registry changes

Add `pluginRootSuffix` to each vendor entry — used to derive plugin root from manifest path by stripping the suffix:

| Vendor | `pluginRootSuffix` |
|---|---|
| Claude Code | `.claude-plugin/plugin.json` |
| Cursor | `.cursor-plugin/plugin.json` |
| Codex | `.codex-plugin/plugin.json` |
| Copilot CLI | `plugin.json` |

### Asset resolution algorithm

For `governance show plugin-name/asset-name`:

1. Check managed scope: `<managed-dir>/plugin-name/asset-name.md`
2. Check project scope: `<root>/governances/plugin-name/asset-name.md`
3. Check user scope: `~/.agents/governances/plugin-name/asset-name.md`
4. Look up `assets.plugin-name` in state JSON → get `{ source, version }`
5. Resolve store path: `~/.agents/.uni-plugin/plugins/<source>/<plugin>@<version>/governances/asset-name.md`

For source-pinned `npm:plugin-name/asset-name`: skip steps 1–3, go directly to step 5 using the specified source. Cannot be shadowed by scope files.

For version-pinned `npm:plugin-name@1.2.3/asset-name`: same as source-pinned, exact version required in store. Fail hard if not present — do not fall back to installed version.

Flat names without `/` (e.g. `plugin-design`) remain backward compatible — resolved through scope chain without plugin index lookup.

### `clean` command

Removes asset store contents. Modelled after `pnpm clean`.

```
uni-plugin clean [--state] [--scope global|project]
```

| Flag | Effect |
|---|---|
| _(none)_ | Remove asset store: `~/.agents/.uni-plugin/plugins/` (global) or `.agents/.uni-plugin/plugins/` (project) |
| `--state` | Also clear `plugins` and `assets` keys from state JSON |
| `--scope global` | Global store only (default) |
| `--scope project` | Project store only |

After `clean`, the next `prepare` run repopulates the store from vendor cache or plugin source.

---

## Open questions

1. Discipline and guideline asset types — are they distinct from governance in loading semantics, or just different naming conventions? Details still in flux; document in `apps/web` once settled.
2. Authentication for source handlers — how are credentials passed when fetching from private GitHub/GitLab instances or private npm registries? Env vars + credential helper pattern deferred to a follow-on RFC.
3. Store garbage collection — versions accumulate as plugins update. When and how are old versions pruned? `uni-plugin clean` removes everything; a future `uni-plugin store prune` could remove only unreferenced versions.
4. Windows MAX_PATH — `longPathsEnabled` in app manifest recommended. Document as a Windows requirement.
5. Custom asset paths — should `plugin.json` support declaring non-standard asset directories (e.g. `"governances": "custom-gov-dir/"`)? Currently convention-only (`governances/`, `disciplines/`, etc.). If supported, `prepare` would need to read the declaration during store population.

---

## Non-goals

- Full plugin resolution system (install, discover, link) — deferred pending adoption
- Skills and commands — handled by vendor plugin installation
- Governance extension/merge semantics — covered by Discussion #6
