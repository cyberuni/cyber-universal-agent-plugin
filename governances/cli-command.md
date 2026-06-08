# CLI Command Conventions

Governance for `universal-plugin` CLI command design. Defines which conventions are required (MUST) and which are available to apply where appropriate (CAN).

---

## Output format

### MUST

Every command that produces output MUST accept `--format <format>` with values:

| Value | Meaning |
|---|---|
| `text` | Human-readable (default) |
| `json` | Machine-readable JSON, pretty-printed |
| `agent` | Structured output for agent consumption (same shape as `json`) |

`--json` is a hidden backward-compat alias for `--format json`. Do not document it in help text.

Data goes to **stdout**. Errors and warnings go to **stderr**.

### Implementation

```ts
// output.ts
function getFormat(): string | undefined {
  const argv = process.argv
  const fmtIdx = argv.indexOf('--format')
  if (fmtIdx !== -1) return argv[fmtIdx + 1]
  if (argv.includes('--json')) return 'json' // hidden alias
  return undefined
}

export function isJsonOutput(): boolean { return getFormat() === 'json' }
export function isAgentOutput(): boolean { return getFormat() === 'agent' }
export function isAutomatedOutput(): boolean {
  const fmt = getFormat()
  return fmt === 'json' || fmt === 'agent'
}

export function output(data: unknown, readable: () => void) {
  if (isJsonOutput() || isAgentOutput()) console.log(JSON.stringify(data, null, 2))
  else readable()
}
```

---

## Exit codes

### MUST

| Code | Meaning |
|---|---|
| `0` | Success (possibly with warnings) |
| `1` | Error — validation failure, not found, invalid args |

---

## Project root

### CAN — any command that reads or writes project files

```
--root <path>    Repo root (defaults to cwd)
```

Use `ROOT_OPTION` from `cli-options.ts`. Never hard-code `process.cwd()` in domain logic — accept root as a parameter.

---

## Dry run

### CAN — any command that writes files or makes network requests

```
--dry-run    Resolve and validate without writing or sending
```

With `--dry-run`, the command resolves all inputs, validates, and reports what would happen — but writes nothing. Exit 0 on success.

---

## Non-interactive mode

### CAN — any command with interactive prompts

```
--yes    Accept all defaults without prompting
```

When `isAutomatedOutput()` is true (format is `json` or `agent`), suppress all interactive prompts automatically — behave as if `--yes` was passed. Never prompt when stdout is not a TTY.

Interactive mode is active only when all of the following are true:
- `process.stdout.isTTY` is true
- `!isAutomatedOutput()`
- `--yes` was not passed
- No explicit scope/target flag was provided that removes the ambiguity

---

## Scope selection

### CAN — any command that installs, reads, or removes artifacts at a configurable scope

```
--global     Act on user-global scope (~/.agents/)
--project    Act on project scope (default)
```

When neither is passed and the command is interactive, prompt the user to select a scope. When neither is passed and the command is non-interactive, default to project scope.

---

## Vendor targeting

### CAN — any command that produces or validates vendor-specific output

```
--vendor <id>    Target a single vendor (e.g. claude-code, cursor, codex, copilot-cli)
```

Without `--vendor`, the command targets all declared vendors. An unknown `--vendor` value is an error (exit 1).

---

## Pagination

### CAN — any command that returns a list that may be large

```
--limit <n>     Maximum number of results (default varies by command)
--offset <n>    Skip the first N results (default: 0)
```

For remote/API-backed commands, cursor-based pagination (`--cursor <token>`) is planned but not yet specified. See [issue #5](https://github.com/cyberuni/cyber-universal-agent-plugin/issues/5).

When `--format json` is used, the response object SHOULD include:

```json
{
  "total": 42,
  "offset": 0,
  "limit": 10,
  "items": [...]
}
```

---

## Verbose output

### CAN — any command where extra detail aids debugging

```
--verbose    Emit additional detail (paths resolved, steps taken, warnings)
```

Verbose output goes to **stderr** so it does not pollute stdout for piped consumers.

---

## Progress output

### CAN — any command with a long-running operation (network, many files)

Progress lines go to **stderr**. They MUST NOT be emitted when `isAutomatedOutput()` is true. Use a simple line-by-line format:

```
Fetching cyberuni/cyber-universal-agent-plugin...
Installing plugin: my-plugin
Done.
```

No spinners or ANSI escape sequences — output must be readable in CI logs.

---

## Output helpers

Use shared helpers from `output.ts` for consistent text formatting:

| Helper | Use |
|---|---|
| `printTable(items, cols)` | Multi-column tabular list |
| `printFields(fields)` | Key-value pairs, aligned |

---

## Branch targeting

### CAN — any command that fetches content from a git remote

```
--branch <branch>    Git branch to fetch from (default: main)
```
