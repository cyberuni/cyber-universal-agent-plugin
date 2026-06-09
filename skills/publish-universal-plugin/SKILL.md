---
name: publish-universal-plugin
description: Use this skill whenever the user wants to publish, release, submit, or share a plugin to the universal plugin marketplace so it works across Claude Code, Cursor, Codex, and GitHub Copilot CLI. Trigger on phrases like "publish my plugin", "submit to marketplace", "release plugin", "list my plugin", "share my plugin", or any mention of getting a plugin into the universal registry. The plugin should already be packaged before using this skill.
---

# Publish Universal Plugin

Guides submitting an already-packaged plugin to the universal plugin registry via a GitHub pull request. The registry follows the same model as Zed extensions — you open a PR that adds your plugin's entry; maintainers review and merge.

**Registry repo:** `cyberuni/marketplace` (adjust if the user has a different target)

## Overview

Publishing has three steps:

1. **Pre-flight** — validate the plugin is ready
2. **Prepare entry** — build the registry entry JSON
3. **Submit PR** — fork, branch, commit, open PR

Work through each step in order. Do not skip pre-flight even if the user says the plugin is ready — the checks catch common mistakes before they reach reviewers.

---

## Step 1: Pre-flight validation

Run these checks against the plugin directory. Stop and fix any failures before continuing.

### 1a. Required metadata

Read `plugin.json` (or whichever manifest exists). Verify:

- `name` — present, kebab-case, unique (no spaces, no uppercase)
- `version` — present, valid semver (`x.y.z`)
- `description` — present, at least 10 characters
- `author` — present (string or `{name, email}` object)
- `homepage` or `repository` — at least one present (reviewers need a source link)
- `license` — present (e.g. `MIT`, `Apache-2.0`)

### 1b. Vendor manifest files

Each runtime expects its manifest at a specific path. Check all four exist and each contains at minimum a `name` field:

| Runtime | Expected path |
|---|---|
| Claude Code | `.claude-plugin/plugin.json` |
| Cursor | `.cursor-plugin/plugin.json` |
| Codex | `.codex-plugin/plugin.json` |
| GitHub Copilot CLI | `plugin.json` (root) |

Read `references/vendor-requirements.md` for the full required-field list per vendor and hook casing rules.

### 1c. Hook casing check

If the plugin has hooks, verify each vendor manifest uses the correct casing for event names:

- Claude Code and Codex: **PascalCase** (`SessionStart`, `PreToolCall`)
- Cursor and GitHub Copilot CLI: **camelCase** (`sessionStart`, `preToolCall`)

Mixed casing in a single manifest causes silent hook failures at runtime.

### 1d. Skills check (if present)

If the plugin ships skills, each `skills/<name>/SKILL.md` must exist and have valid YAML frontmatter with at minimum `name` and `description` fields.

### 1e. Report

After all checks, list what passed and what failed. Do not proceed to Step 2 until all checks pass.

---

## Step 2: Prepare registry entry

Build the JSON object that will be added to the registry. Use this exact shape:

```json
{
  "name": "<plugin-name>",
  "version": "<semver>",
  "description": "<one-line description>",
  "author": "<author name or org>",
  "homepage": "<URL>",
  "repository": "<git clone URL>",
  "license": "<SPDX identifier>",
  "runtimes": ["claude-code", "cursor", "codex", "copilot-cli"],
  "publishedAt": "<ISO 8601 date>"
}
```

Rules:
- `runtimes` lists only the runtimes whose vendor manifests passed validation in Step 1b
- `publishedAt` is today's date in `YYYY-MM-DD` format
- `homepage` and `repository` should both be present if available; omit whichever is absent rather than leaving empty

Show the entry to the user and ask them to confirm before proceeding.

---

## Step 3: Submit PR

Use the `gh` CLI throughout. Confirm each command with the user before running if it affects shared state (fork, push, PR open).

### 3a. Fork and clone the registry

```bash
gh repo fork cyberuni/universal-plugin-registry --clone --remote
cd universal-plugin-registry
```

If the user already has a fork, skip the fork step and just ensure the fork is up to date:

```bash
git fetch upstream
git merge upstream/main
```

### 3b. Create a branch

```bash
git checkout -b add-<plugin-name>
```

### 3c. Add the registry entry

The registry stores entries in `plugins/<plugin-name>.json`. Write the entry from Step 2 to that file:

```bash
# write the JSON to plugins/<plugin-name>.json
```

If `plugins/<plugin-name>.json` already exists, this is an update — read the existing file first and preserve any fields not in the standard entry shape (some entries may have curator-added fields).

### 3d. Commit and push

```bash
git add plugins/<plugin-name>.json
git commit -m "feat: add <plugin-name> v<version>"
git push origin add-<plugin-name>
```

### 3e. Open the PR

```bash
gh pr create \
  --repo cyberuni/universal-plugin-registry \
  --title "Add <plugin-name> v<version>" \
  --body "$(cat <<'EOF'
## Plugin

**Name:** <plugin-name>
**Version:** <version>
**Author:** <author>
**License:** <license>

## Description

<description>

## Runtimes

- [x] Claude Code
- [x] Cursor
- [x] Codex
- [x] GitHub Copilot CLI

## Links

- Homepage: <homepage>
- Repository: <repository>

## Checklist

- [ ] All four vendor manifests present and valid
- [ ] Hook event casing correct per vendor
- [ ] Semver version string
- [ ] SPDX license identifier
EOF
)"
```

Return the PR URL to the user when done.

---

## Common failure modes

| Problem | Fix |
|---|---|
| Hook events silently don't fire | Check casing: Claude Code/Codex need PascalCase, Cursor/Copilot CLI need camelCase |
| Codex rejects manifest | `version` and `description` are required by Codex — add them if missing |
| PR rejected: missing source link | Add `homepage` or `repository` to plugin.json |
| PR rejected: name conflict | Rename the plugin — check the registry for existing `plugins/<name>.json` files first |

---

## Reference files

- `references/vendor-requirements.md` — required fields and hook casing rules per runtime
