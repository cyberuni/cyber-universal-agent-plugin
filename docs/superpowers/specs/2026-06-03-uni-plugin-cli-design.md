# uni-plugin CLI Design

**Date:** 2026-06-03
**Status:** Approved
**Issue:** [#3](https://github.com/cyberuni/cyber-universal-agent-plugin/issues/3)

---

## Problem

`uni-plugin` currently has only one command (`build`). It needs to grow into a full CLI for universal agent plugin authoring, distribution, and consumption — modeled after `cyber-skills`.

Two gaps drive this:

1. **Authoring gap:** No commands for validating, initializing, or preparing a plugin after install.
2. **Referencing gap:** Agents and skills that need governance content currently grep for files at runtime. There is no stable name-to-location contract — fragile when plugin structure changes.

---

## Goals

1. Full command surface covering the plugin lifecycle: build, validate, init, prepare, install/manage, governance, marketplace.
2. A stable `governance` subcommand so agents resolve governance by name, not path.
3. Internal contributor tooling (agents, skills, governances) built first and used to implement the rest.
4. Screaming architecture — one domain folder per command group.

---

## Architecture

### Directory layout

```
src/
  build/        # already exists
  validate/
  governance/
  init/
  prepare/
  marketplace/
  plugin/       # owns add/remove/update/find/search/list/migrate
  hook/
  cli.ts
  cli-options.ts
  output.ts
```

### Per-domain pattern (3-file)

| File | Responsibility |
|---|---|
| `cli.ts` | Commander adapter — parses args, calls domain, formats output |
| `*.ts` | Pure domain logic — no I/O, fully unit-testable |
| `fs.ts` | Filesystem/network side effects — injected as deps |

### Testing

`*.spec.ts` files at the domain boundary, BDD/Gherkin descriptions:

```ts
describe('build plugin', () => {
  describe('Given a valid .plugin/plugin.json', () => {
    it('When building for claude-code, Then writes .claude-plugin/plugin.json', ...)
  })
})
```

---

## CLI Command Surface

```
uni-plugin add <plugin>
uni-plugin remove <plugin>
uni-plugin update [plugin]
uni-plugin find <query>
uni-plugin search <query>
uni-plugin list
uni-plugin migrate
uni-plugin build [--vendor <id>]
uni-plugin validate
uni-plugin init
uni-plugin prepare
uni-plugin hook register
uni-plugin governance show <name>
uni-plugin governance list
uni-plugin marketplace publish
uni-plugin marketplace register
```

---

## Governance Command

### Purpose

Agents and skills reference governance content by name rather than file path. `uni-plugin governance show <name>` resolves the name and outputs the content. This eliminates grep-at-runtime and survives plugin structure changes.

### Resolution order

**project → global → package** (first match wins)

| Layer | Path |
|---|---|
| Project | `./governances/<name>.md` |
| Global | `~/.agents/governances/<name>.md` |
| Package | `governances/` shipped inside `uni-plugin` npm package |

This lets projects override shipped governances, and users override project governances via their global config.

### Why governances are not `rules`

`rules` (Cursor `.mdc` files) is an always-on injection mechanism — everything gets it every session. In an orchestrative multi-agent model, "always-on" should be the smallest possible HCF: constraints that truly apply to every agent regardless of role.

Governances are cross-cutting shared content but they are **not** always-on. They are loaded on demand by whichever agent, skill, command, hook, or MCP server needs them. `uni-plugin governance` is the delivery mechanism for this demand-driven model.

`rules` survives for backward compatibility and simple single-agent use cases. Governances are a separate concept with separate delivery.

---

## Two-Layer Agent/Skill System

### Layer 1 — Internal contributor tooling (`.agents/`)

Built first. Used to build everything else. Iterated per domain.

```
.agents/
  agents/
    domain-implementer.md
    spec-writer.md
    doc-writer.md
  skills/
    add-domain/SKILL.md
    add-spec/SKILL.md
  governances/
    screaming-architecture.md
    clean-architecture.md
```

### Layer 2 — Shipped with plugin

```
commands/
  build.md
  validate.md
  init.md
  prepare.md
skills/
  universal-plugin/SKILL.md    # already exists
agents/
  builder.md
  validator.md
  installer.md
```

---

## Naming System

| Layer | Convention | Examples |
|---|---|---|
| CLI commands / skills | short imperative verbs | `build`, `validate`, `init`, `prepare` |
| Agents | neutral role nouns | `builder`, `validator`, `installer`, `migrator` |
| Hooks | PascalCase canonical | `PreBuild`, `PostBuild`, `PluginInstalled` |
| Error types | PascalCase noun phrases | `ManifestNotFound`, `ValidationFailed` |
| Config keys | camelCase noun phrases | `defaultVendors`, `pluginRoot`, `registryUrl` |

---

## Development Process

- **Spec-Driven Development:** each domain starts with a Gherkin `.feature` file or inline BDD spec before any implementation
- **Unit of work = one commit:** domain impl + spec + website docs update together
- **Layer 1 first:** build internal agents/skills, then use them to implement layer 2
- **Iterate:** improve internal tooling on each domain pass

---

## Tools

vitest, biome, tsdown, tsx, changeset, commitlint, husky, knip (same as `cyber-skills`)

---

## Open Questions

1. **`commands/` vs `skills/` for slash invocation** — correct distinction across Claude Code, Cursor, Codex, Copilot CLI is unresolved. Produce an ADR or shipped governance `slash-invocation.md` before implementing Layer 2 commands.

2. **`plugin.json` top-level `governances` field** — whether to add this to the canonical schema is a standards-track question. Not needed for the CLI; `uni-plugin governance` is the consumption-side solution. Propose to open-plugin-spec when the consumption pattern is proven.

3. **Global config path** — `~/.agents/governances/` assumes a shared agents config directory. The right global path may depend on what `cyber-skills` uses. Align before shipping `governance show`.
