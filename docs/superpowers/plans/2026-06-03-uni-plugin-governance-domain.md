# uni-plugin governance domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `uni-plugin governance show <name>` and `uni-plugin governance list` commands with managed → project → user → package scope resolution.

**Architecture:** Screaming architecture — one domain folder per command group. The `governance/` domain follows the 3-file pattern: `cli.ts` (Commander adapter), `governance.ts` (pure domain logic, no I/O), `fs.ts` (filesystem side effects injected as a dependency). Tests use BDD/Gherkin descriptions and inject a mock fs — no real filesystem access in unit tests.

**Tech Stack:** Node.js 22+, TypeScript 6, Commander 14, Vitest 4, tsdown (ESM build)

---

## Scope note

This is **Plan 1 of N** for the full `uni-plugin` CLI redesign (see spec `docs/superpowers/specs/2026-06-03-uni-plugin-cli-design.md`). It covers the governance domain only. Other command groups (validate, init, prepare, plugin management, hook, marketplace, Layer 1 internal tooling) are separate plans.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/uni-plugin/src/governance/governance.ts` | Pure domain: scope path resolution, show, list |
| Create | `packages/uni-plugin/src/governance/governance.test.ts` | Domain unit tests |
| Create | `packages/uni-plugin/src/governance/fs.ts` | GovernanceFs interface + real implementation |
| Create | `packages/uni-plugin/src/governance/cli.ts` | Commander adapter for `governance show` and `governance list` |
| Modify | `packages/uni-plugin/src/cli.ts` | Wire in `governanceCommand()` |
| Modify | `packages/uni-plugin/src/bin/uni-plugin.test.mts` | Add smoke tests for governance commands |
| Create | `packages/uni-plugin/governances/.gitkeep` | Ship-empty baseline governances directory |
| Modify | `packages/uni-plugin/package.json` | Add `"governances"` to `files` array |

---

## Task 1: Create the GovernanceFs interface and real implementation

**Files:**
- Create: `packages/uni-plugin/src/governance/fs.ts`

- [ ] **Step 1: Write the file**

```ts
import * as fs from 'node:fs'

export interface GovernanceFs {
	exists(filePath: string): boolean
	read(filePath: string): string
	list(dir: string): string[]
}

export const realGovernanceFs: GovernanceFs = {
	exists: (p) => fs.existsSync(p),
	read: (p) => fs.readFileSync(p, 'utf8'),
	list: (dir) => {
		if (!fs.existsSync(dir)) return []
		return fs
			.readdirSync(dir)
			.filter((f) => f.endsWith('.md'))
			.map((f) => f.slice(0, -3))
	},
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd packages/uni-plugin && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/uni-plugin/src/governance/fs.ts
git commit -m "feat(governance): add GovernanceFs interface and real implementation"
```

---

## Task 2: Implement governance domain logic with failing tests

**Files:**
- Create: `packages/uni-plugin/src/governance/governance.ts`
- Create: `packages/uni-plugin/src/governance/governance.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/uni-plugin/src/governance/governance.test.ts`:

```ts
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GovernanceFs } from './fs.js'
import {
	getManagedDir,
	getPackageDir,
	getProjectDir,
	getUserDir,
	listGovernances,
	showGovernance,
} from './governance.js'

function makeMockFs(files: Record<string, string>): GovernanceFs {
	return {
		exists: (p) => p in files,
		read: (p) => files[p] ?? '',
		list: (dir) =>
			Object.keys(files)
				.filter((p) => p.startsWith(dir + path.sep) && p.endsWith('.md'))
				.map((p) => path.basename(p, '.md')),
	}
}

const ROOT = '/fake/project'

describe('getManagedDir', () => {
	it('returns a platform-specific path', () => {
		const dir = getManagedDir()
		expect(typeof dir).toBe('string')
		expect(dir.length).toBeGreaterThan(0)
	})
})

describe('getUserDir', () => {
	it('returns a path under the home directory', () => {
		expect(getUserDir()).toBe(path.join(os.homedir(), '.agents', 'governances'))
	})
})

describe('getProjectDir', () => {
	it('returns <root>/governances', () => {
		expect(getProjectDir('/my/project')).toBe('/my/project/governances')
	})
})

describe('showGovernance', () => {
	describe('Given a governance exists at project scope', () => {
		it('When showing by name, Then returns content and scope=project', () => {
			const projectFile = path.join(getProjectDir(ROOT), 'plugin-design.md')
			const govFs = makeMockFs({ [projectFile]: '# Plugin Design\ncontent' })

			const result = showGovernance('plugin-design', ROOT, govFs)

			expect(result).not.toBeNull()
			expect(result!.scope).toBe('project')
			expect(result!.content).toBe('# Plugin Design\ncontent')
		})
	})

	describe('Given the same governance exists at project and user scope', () => {
		it('When showing by name, Then project scope wins (higher authority)', () => {
			const projectFile = path.join(getProjectDir(ROOT), 'plugin-design.md')
			const userFile = path.join(getUserDir(), 'plugin-design.md')
			const govFs = makeMockFs({
				[projectFile]: 'project version',
				[userFile]: 'user version',
			})

			const result = showGovernance('plugin-design', ROOT, govFs)

			expect(result!.scope).toBe('project')
			expect(result!.content).toBe('project version')
		})
	})

	describe('Given a governance exists at user scope only', () => {
		it('When showing by name, Then returns content and scope=user', () => {
			const userFile = path.join(getUserDir(), 'plugin-design.md')
			const govFs = makeMockFs({ [userFile]: 'user content' })

			const result = showGovernance('plugin-design', ROOT, govFs)

			expect(result!.scope).toBe('user')
			expect(result!.content).toBe('user content')
		})
	})

	describe('Given a governance exists at package scope only', () => {
		it('When showing by name, Then returns content and scope=package', () => {
			const pkgFile = path.join(getPackageDir(), 'plugin-design.md')
			const govFs = makeMockFs({ [pkgFile]: 'package content' })

			const result = showGovernance('plugin-design', ROOT, govFs)

			expect(result!.scope).toBe('package')
			expect(result!.content).toBe('package content')
		})
	})

	describe('Given no governance exists at any scope', () => {
		it('When showing by name, Then returns null', () => {
			const govFs = makeMockFs({})
			expect(showGovernance('missing', ROOT, govFs)).toBeNull()
		})
	})
})

describe('listGovernances', () => {
	describe('Given governances at multiple scopes', () => {
		it('When listing, Then returns all unique names with highest-scope annotation', () => {
			const projectFile = path.join(getProjectDir(ROOT), 'plugin-design.md')
			const userFile1 = path.join(getUserDir(), 'plugin-design.md')
			const userFile2 = path.join(getUserDir(), 'commit-discipline.md')
			const govFs = makeMockFs({
				[projectFile]: 'project',
				[userFile1]: 'user',
				[userFile2]: 'user',
			})

			const entries = listGovernances(ROOT, govFs)

			expect(entries).toHaveLength(2)
			const pluginDesign = entries.find((e) => e.name === 'plugin-design')!
			expect(pluginDesign.scope).toBe('project')
			const commitDiscipline = entries.find((e) => e.name === 'commit-discipline')!
			expect(commitDiscipline.scope).toBe('user')
		})
	})

	describe('Given no governances at any scope', () => {
		it('When listing, Then returns empty array', () => {
			expect(listGovernances(ROOT, makeMockFs({}))).toEqual([])
		})
	})

	describe('Given governances at multiple scopes with the same name', () => {
		it('When listing, Then de-duplicates by name (highest scope wins)', () => {
			const projectFile = path.join(getProjectDir(ROOT), 'shared.md')
			const userFile = path.join(getUserDir(), 'shared.md')
			const govFs = makeMockFs({ [projectFile]: 'p', [userFile]: 'u' })

			const entries = listGovernances(ROOT, govFs)

			expect(entries).toHaveLength(1)
			expect(entries[0]!.scope).toBe('project')
		})
	})

	describe('Given governances at multiple scopes', () => {
		it('When listing, Then returns entries sorted alphabetically by name', () => {
			const govFs = makeMockFs({
				[path.join(getUserDir(), 'zzz.md')]: '',
				[path.join(getUserDir(), 'aaa.md')]: '',
			})

			const entries = listGovernances(ROOT, govFs)

			expect(entries.map((e) => e.name)).toEqual(['aaa', 'zzz'])
		})
	})
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd packages/uni-plugin && pnpm test
```

Expected: FAIL — `Cannot find module './governance.js'`

- [ ] **Step 3: Write the domain implementation**

`packages/uni-plugin/src/governance/governance.ts`:

```ts
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GovernanceFs } from './fs.js'

export type Scope = 'managed' | 'project' | 'user' | 'package'

export interface ScopedPath {
	scope: Scope
	dir: string
}

export interface GovernanceEntry {
	name: string
	scope: Scope
}

export interface ShowResult {
	content: string
	scope: Scope
}

export function getManagedDir(): string {
	if (process.platform === 'darwin') return '/Library/Application Support/UniPlugin/governances'
	if (process.platform === 'win32') return 'C:\\ProgramData\\UniPlugin\\governances'
	return '/etc/uni-plugin/governances'
}

export function getUserDir(): string {
	return path.join(os.homedir(), '.agents', 'governances')
}

export function getProjectDir(root: string): string {
	return path.join(root, 'governances')
}

export function getPackageDir(): string {
	const thisFile = fileURLToPath(import.meta.url)
	return path.join(path.dirname(thisFile), '..', '..', 'governances')
}

export function getScopedPaths(root: string): ScopedPath[] {
	return [
		{ scope: 'managed', dir: getManagedDir() },
		{ scope: 'project', dir: getProjectDir(root) },
		{ scope: 'user', dir: getUserDir() },
		{ scope: 'package', dir: getPackageDir() },
	]
}

export function showGovernance(name: string, root: string, govFs: GovernanceFs): ShowResult | null {
	for (const { scope, dir } of getScopedPaths(root)) {
		const filePath = path.join(dir, `${name}.md`)
		if (govFs.exists(filePath)) {
			return { content: govFs.read(filePath), scope }
		}
	}
	return null
}

export function listGovernances(root: string, govFs: GovernanceFs): GovernanceEntry[] {
	const seen = new Set<string>()
	const entries: GovernanceEntry[] = []
	for (const { scope, dir } of getScopedPaths(root)) {
		for (const name of govFs.list(dir)) {
			if (!seen.has(name)) {
				seen.add(name)
				entries.push({ name, scope })
			}
		}
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd packages/uni-plugin && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

```bash
cd packages/uni-plugin && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/uni-plugin/src/governance/governance.ts packages/uni-plugin/src/governance/governance.test.ts
git commit -m "feat(governance): implement scope-resolved show and list domain logic"
```

---

## Task 3: Build the Commander CLI adapter

**Files:**
- Create: `packages/uni-plugin/src/governance/cli.ts`

- [ ] **Step 1: Write the CLI adapter**

```ts
import { Command, Option } from 'commander'
import { ROOT_OPTION, resolveRoot } from '../cli-options.js'
import { output, printTable } from '../output.js'
import { realGovernanceFs } from './fs.js'
import { listGovernances, showGovernance } from './governance.js'

export function governanceCommand(): Command {
	const cmd = new Command('governance').description('Manage plugin governances')

	cmd
		.command('show <name>')
		.description('Show a governance by name')
		.addOption(ROOT_OPTION)
		.addOption(new Option('--json').hideHelp())
		.action((name: string, opts: { root?: string }) => {
			const result = showGovernance(name, resolveRoot(opts.root), realGovernanceFs)
			if (!result) {
				process.stderr.write(`Governance "${name}" not found\n`)
				process.exit(1)
			}
			output(result, () => {
				process.stdout.write(result.content)
			})
		})

	cmd
		.command('list')
		.description('List available governances')
		.addOption(ROOT_OPTION)
		.addOption(new Option('--json').hideHelp())
		.action((opts: { root?: string }) => {
			const entries = listGovernances(resolveRoot(opts.root), realGovernanceFs)
			output(entries, () => {
				printTable(entries, [
					{ label: 'name', get: (e) => e.name },
					{ label: 'scope', get: (e) => e.scope },
				])
			})
		})

	return cmd
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/uni-plugin && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/uni-plugin/src/governance/cli.ts
git commit -m "feat(governance): add Commander CLI adapter for show and list"
```

---

## Task 4: Wire the governance command into the root CLI

**Files:**
- Modify: `packages/uni-plugin/src/cli.ts`

- [ ] **Step 1: Add the import and register the command**

Replace the contents of `packages/uni-plugin/src/cli.ts`:

```ts
#!/usr/bin/env node
import { Command } from 'commander'

import { buildCommand } from './build/cli.js'
import { governanceCommand } from './governance/cli.js'

const program = new Command()

program.name('uni-plugin').description('Universal AI agent plugin build tool').version('0.0.0')

program.addCommand(buildCommand())
program.addCommand(governanceCommand())

program.parseAsync(process.argv).catch((err: unknown) => {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
	process.exit(1)
})
```

- [ ] **Step 2: Build**

```bash
cd packages/uni-plugin && pnpm build
```

Expected: build completes, `dist/cli.mjs` updated.

- [ ] **Step 3: Smoke test the commands manually**

```bash
node packages/uni-plugin/bin/uni-plugin.mjs governance --help
```

Expected output includes:
```
Commands:
  show <name>
  list
```

```bash
node packages/uni-plugin/bin/uni-plugin.mjs governance list
```

Expected: `(none)` (no governances exist yet) or a table if any exist.

```bash
node packages/uni-plugin/bin/uni-plugin.mjs governance show missing
```

Expected: exits with status 1 and stderr `Governance "missing" not found`.

- [ ] **Step 4: Commit**

```bash
git add packages/uni-plugin/src/cli.ts
git commit -m "feat(governance): wire governance command into CLI"
```

---

## Task 5: Add smoke tests for the governance commands

**Files:**
- Modify: `packages/uni-plugin/src/bin/uni-plugin.test.mts`

- [ ] **Step 1: Add the smoke tests**

Append to `packages/uni-plugin/src/bin/uni-plugin.test.mts` after the existing tests:

```ts
import * as os from 'node:os'

test('governance list returns (none) when no governances exist', () => {
	const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-plugin-gov-'))
	try {
		const result = spawnSync('node', [bin, 'governance', 'list', '--root', empty], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(0)
		expect(result.stdout).toMatch(/\(none\)/)
	} finally {
		fs.rmSync(empty, { recursive: true, force: true })
	}
})

test('governance list returns governance name and scope', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-plugin-gov-'))
	try {
		fs.mkdirSync(path.join(root, 'governances'))
		fs.writeFileSync(path.join(root, 'governances', 'plugin-design.md'), '# Plugin Design')
		const result = spawnSync('node', [bin, 'governance', 'list', '--root', root], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(0)
		expect(result.stdout).toMatch(/plugin-design/)
		expect(result.stdout).toMatch(/project/)
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test('governance show outputs content for a known governance', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-plugin-gov-'))
	try {
		fs.mkdirSync(path.join(root, 'governances'))
		fs.writeFileSync(path.join(root, 'governances', 'plugin-design.md'), '# Plugin Design\ncontent here')
		const result = spawnSync('node', [bin, 'governance', 'show', 'plugin-design', '--root', root], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(0)
		expect(result.stdout).toMatch(/# Plugin Design/)
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test('governance show exits 1 for unknown governance', () => {
	const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-plugin-gov-'))
	try {
		const result = spawnSync('node', [bin, 'governance', 'show', 'missing', '--root', empty], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(1)
		expect(result.stderr).toMatch(/not found/)
	} finally {
		fs.rmSync(empty, { recursive: true, force: true })
	}
})

test('governance show --json returns structured output', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-plugin-gov-'))
	try {
		fs.mkdirSync(path.join(root, 'governances'))
		fs.writeFileSync(path.join(root, 'governances', 'test-gov.md'), 'content')
		const result = spawnSync('node', [bin, 'governance', 'show', 'test-gov', '--json', '--root', root], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(0)
		const parsed = JSON.parse(result.stdout)
		expect(parsed.scope).toBe('project')
		expect(parsed.content).toBe('content')
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
})
```

- [ ] **Step 2: Run all tests**

```bash
cd packages/uni-plugin && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/uni-plugin/src/bin/uni-plugin.test.mts
git commit -m "test(governance): add smoke tests for governance show and list"
```

---

## Task 6: Ship empty baseline governances directory

**Files:**
- Create: `packages/uni-plugin/governances/.gitkeep`
- Modify: `packages/uni-plugin/package.json`

- [ ] **Step 1: Create the directory and gitkeep**

```bash
mkdir -p packages/uni-plugin/governances
touch packages/uni-plugin/governances/.gitkeep
```

- [ ] **Step 2: Add `"governances"` to the files array in package.json**

In `packages/uni-plugin/package.json`, update the `files` field:

```json
"files": [
  "bin",
  "dist",
  "governances"
],
```

- [ ] **Step 3: Verify the full test suite still passes**

```bash
cd packages/uni-plugin && pnpm verify
```

Expected: typecheck + lint + tests all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/uni-plugin/governances/.gitkeep packages/uni-plugin/package.json
git commit -m "feat(governance): ship empty baseline governances directory"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `governance show <name>` command | Tasks 2, 3, 4, 5 |
| `governance list` command | Tasks 2, 3, 4, 5 |
| managed → project → user → package resolution order | Task 2 (`getScopedPaths`) |
| Higher scope wins on conflict | Task 2 (`listGovernances` de-dup, `showGovernance` first-match) |
| Additive: lower scopes can add names not in higher scopes | Task 2 (`listGovernances` seen-set) |
| Package-level baseline governances directory | Task 6 |
| `--json` output | Task 5 (smoke test) |
| 3-file domain pattern (cli, domain, fs) | Tasks 1, 2, 3 |
| BDD/Gherkin test descriptions | Task 2 |

**Placeholder scan:** no TBDs, no incomplete steps, all code blocks complete.

**Type consistency:** `GovernanceEntry`, `ShowResult`, `Scope`, `GovernanceFs` defined in Tasks 1–2 and used consistently in Tasks 3–5.

**Note on `getPackageDir()`:** at runtime the compiled file is at `dist/governance/cli.mjs`; `fileURLToPath(import.meta.url)` resolves to that path, and `../../governances` correctly reaches `packages/uni-plugin/governances/`. In unit tests the package dir is never accessed directly — the injected mock fs controls what `exists()` and `list()` return for any path.
