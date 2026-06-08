# Dogfooding: `publish sync-version` command

**Date:** 2026-06-08
**Status:** Approved

## Goal

Use the `universal-plugin` CLI in this repo to build and publish its own plugin — dogfooding the tool against itself. Two integration points:

1. **Manual / pipeline**: run `universal-plugin build` to generate vendor manifests from `.plugin/plugin.json`
2. **Version sync**: before publishing, sync the version in `.plugin/plugin.json` from the npm package

## Problem: version sync

`.plugin/plugin.json` requires a `version` field when targeting codex. This version must match the npm package version (`packages/universal-plugin/package.json`). Changesets manages the npm version; `.plugin/plugin.json` must be updated after `changeset version` runs — not during build, because the npm version is not yet final at build time.

## Solution

### 1. New field: `packagePath` in `.plugin/plugin.json`

A relative path (from repo root) pointing to the folder of the npm package whose version the plugin tracks.

```json
{
  "packagePath": "packages/universal-plugin"
}
```

- Required for `publish sync-version` to work
- If absent, the command exits with a clear error message
- Points to the folder; the command reads `<packagePath>/package.json` internally

### 2. New command: `universal-plugin publish sync-version`

A new `publish` command group with a `sync-version` subcommand.

```
universal-plugin publish sync-version [--root <path>]
```

**Behavior:**

1. Read `.plugin/plugin.json` at `<root>`; extract `packagePath`
2. Read `<root>/<packagePath>/package.json`; extract `version`
3. Write `version` into `.plugin/plugin.json` in place (preserve all other fields)
4. Exit non-zero with a clear message if:
   - `.plugin/plugin.json` is missing
   - `packagePath` field is absent
   - `<packagePath>/package.json` is missing or has no `version`

### 3. Dogfooding scripts in root `package.json`

```json
"version": "changeset version && pnpm --filter universal-plugin exec tsx src/cli.ts publish sync-version --root ../..",
"plugin:build": "pnpm --filter universal-plugin exec tsx src/cli.ts build --root ../.."
```

- `pnpm version` bumps npm versions via changesets, then syncs `.plugin/plugin.json`
- `pnpm plugin:build` generates vendor manifests (`.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`, `plugin.json`)
- Both use `tsx` so no compile step is required for local dev

## Files changed

| File | Change |
|---|---|
| `.plugin/plugin.json` | Add `packagePath: "packages/universal-plugin"` |
| `packages/universal-plugin/src/publish/cli.ts` | New — `publish` command group with `sync-version` subcommand |
| `packages/universal-plugin/src/publish/sync-version.ts` | New — core logic for reading/writing version |
| `packages/universal-plugin/src/publish/sync-version.test.ts` | New — unit tests |
| `packages/universal-plugin/src/cli.ts` | Register `publishCommand` |
| `package.json` (root) | Update `version` script; add `plugin:build` script |

## Out of scope

- Auto-running `plugin:build` in CI (can be added later)
- Validating that `version` in `.plugin/plugin.json` matches `packagePath` at build time
- Any other `publish` subcommands
