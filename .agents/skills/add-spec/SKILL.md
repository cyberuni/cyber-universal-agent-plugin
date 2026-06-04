---
name: add-spec
description: Use this skill when adding a domain spec and BDD feature file to uni-plugin for a planned command.
metadata:
  internal: true
---

# Add Domain Spec

## When to use

A new domain is being added to `uni-plugin` and needs:
- `specs/<domain>/spec.md` — narrative spec
- `specs/<domain>/<domain>.feature` — Gherkin scenarios

Also use to add missing BDD scenarios to an existing spec.

## Steps

### 1. Read existing specs for pattern

Read two files before writing anything:
- An existing `specs/<domain>/spec.md` (e.g. `specs/build/spec.md`)
- Its companion `.feature` (e.g. `specs/build/build.feature`)

These are the canonical patterns. Do not deviate without cause.

### 2. Check cli-command governance

Run:
```bash
uni-plugin governance show cli-command
```

If it returns nothing, read `packages/uni-plugin/governances/cli-command.md` directly.

Key rules to carry into the spec:
- Output flag is `--format <format>` (values: `text`, `json`, `agent`). `--json` is a hidden alias only — never document it as a primary flag.
- Exit 0 = success (possibly with warnings), 1 = error.
- Errors → stderr. Data → stdout.
- A domain MUST accept `--format` if it produces any output.
- `--root <path>`, `--dry-run`, `--yes`, `--global`/`--project`, `--vendor`, `--limit`/`--offset`, `--verbose`, `--branch` are CAN options — include only the ones that fit this domain.

### 3. Write `specs/<domain>/spec.md`

Use this structure exactly:

```markdown
# <Domain> Domain Spec

**Status:** Planned
**Commands:** `uni-plugin <command> [options]`
**Governance:** [cli-command](../../governances/cli-command.md)

---

## What

<One paragraph: what this domain does.>

---

## Why

<One paragraph: what problem it solves and why a dedicated command is needed.>

---

## Design decisions

### <Decision title>
<Normative rule or constraint. No rationale prose.>

### <Decision title>
...

---

## Command surface

\`\`\`
uni-plugin <command> [options]
\`\`\`

**Exit codes:**
- `0` — <success condition>
- `1` — <error conditions>

**Gherkin scenarios:** `<domain>.feature` (planned)
```

Rules:
- `Status` is `Planned` until implemented.
- Each design decision is a named subsection. One decision per subsection.
- The command surface block lists the full flag set, referencing only CAN options that apply.
- If the domain has subcommands, add a `### uni-plugin <sub>` heading per subcommand inside the command surface section.

### 4. Write `specs/<domain>/<domain>.feature`

Each feature file covers one command group. Use this shape:

```gherkin
Feature: <verb> <noun>

  Background:
    Given <shared precondition>

  Scenario: <happy path name>
    Given <setup>
    When I run "uni-plugin <command> [flags] --root <root>"
    Then the exit code is 0
    And <observable output assertion>

  Scenario: <error case name>
    ...
    Then the exit code is 1
    And stderr contains "<message fragment>"
```

Mandatory scenario categories — include at least one of each that applies:

| Category | When required |
|---|---|
| Happy path | Always |
| Missing input / not found | Always |
| `--dry-run` preview | When the command writes files or makes requests |
| `--format json` output | Always if the domain produces output |
| `--format json` suppresses prompts | When the command is interactive |
| `--global` vs `--project` scope | When the domain supports scope flags |
| `--vendor` targeting | When the domain is vendor-aware |
| `--limit` + `--offset` | When the command returns a list |
| Idempotent re-run | When the domain is designed to be idempotent |
| Partial failure | When failure of one item shouldn't block others |

For `--format json` scenarios, assert on structure:
```gherkin
Then stdout is valid JSON with a "<field>" array
```

For error scenarios, always assert both exit code and stderr content:
```gherkin
Then the exit code is 1
And stderr contains "<fragment>"
```

<!-- TODO: extract scenario template generation to scripts/scaffold-feature.ts -->

### 5. Update main spec.md domain index

Add a line to the `## Domain index` section in `packages/uni-plugin/specs/spec.md`:

```markdown
- [<domain>](./<domain>/spec.md) — <one-line description matching the What section>
```

Also update the `## Command surface` table: change `Planned` status to `Implemented` when done.

### 6. Fix `--json` in any existing specs touched

If editing an existing spec or feature file, replace any `--json` primary flag with `--format json`:

- `spec.md`: update the command surface block and any design decision that mentions `--json`
- `.feature`: update `When I run "... --json ..."` to `--format json`

### 7. Commit

Two commits in this order:

1. `docs(specs): add <domain> domain spec` — only `specs/<domain>/spec.md` + `specs/spec.md` update
2. `docs(specs): add <domain> BDD scenarios` — only `specs/<domain>/<domain>.feature`

If fixing existing specs, include those in commit 1.

Never batch unrelated domains into one commit.

## Anti-patterns

- Writing `--json` as a primary flag in any spec or feature file
- Omitting the `--format json` scenario when a command produces output
- Omitting the `Governance:` header line from the spec frontmatter
- Adding a `## Why` section to design decisions subsections (prose rationale belongs in `## Why` at the top, not inside decisions)
- Forgetting to update the main `specs/spec.md` domain index
- Committing spec and feature file in the same commit
