# Dogfooding: `publish sync-version` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `universal-plugin publish sync-version` command that writes the npm package version into `.plugin/plugin.json`, and wire up dogfooding scripts so this repo uses its own CLI to build and version-sync the plugin.

**Architecture:** Core logic in `src/publish/sync-version.ts` reads `packagePath` from `.plugin/plugin.json`, looks up the version from that folder's `package.json`, and writes it back in place. A new `publish` command group in `src/publish/cli.ts` exposes this as a CLI subcommand. Two root scripts wire it into the changesets version flow and manual plugin build.

**Tech Stack:** TypeScript, Node.js `fs`, Commander.js, Vitest, `tsx` (dev), `tsdown` (build)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.plugin/plugin.json` | Modify | Add `packagePath` field |
| `packages/universal-plugin/src/publish/sync-version.ts` | Create | Read `packagePath`, resolve version, write back to manifest |
| `packages/universal-plugin/src/publish/sync-version.test.ts` | Create | Unit tests for `syncVersion` |
| `packages/universal-plugin/src/publish/cli.ts` | Create | Commander `publish` group with `sync-version` subcommand |
| `packages/universal-plugin/src/bin/universal-plugin.test.mts` | Modify | Integration tests for `publish sync-version` |
| `packages/universal-plugin/src/cli.ts` | Modify | Register `publishCommand` |
| `package.json` (root) | Modify | Update `version` script; add `plugin:build` script |

---

## Task 1: Add `packagePath` to `.plugin/plugin.json`

**Files:**
- Modify: `.plugin/plugin.json`

- [ ] **Step 1: Add `packagePath` field**

Open `.plugin/plugin.json` and add `"packagePath": "packages/universal-plugin"` after the `"license"` field:

```json
{
	"$schema": "https://raw.githubusercontent.com/cyberuni/universal-plugin/refs/heads/main/schema/v1.json",
	"name": "universal-plugin",
	"description": "Research and design toolkit for building universal AI coding agent plugins that work across Claude Code, Cursor, Codex, and GitHub Copilot CLI.",
	"author": { "name": "unional" },
	"homepage": "https://github.com/cyberuni/universal-plugin",
	"repository": "https://github.com/cyberuni/universal-plugin",
	"license": "MIT",
	"packagePath": "packages/universal-plugin",
	"keywords": ["universal", "plugin", "agent", "cross-vendor"],
	"vendors": ["claude-code", "cursor", "codex", "copilot-cli"],
	"skills": "./skills/",
	"vendorExtensions": {
		"claude-code": {
			"assets": "./assets/"
		},
		"cursor": {},
		"codex": {},
		"copilot-cli": {}
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add .plugin/plugin.json
git commit -m "chore: add packagePath to .plugin/plugin.json"
```

---

## Task 2: Write `syncVersion` unit tests (red)

**Files:**
- Create: `packages/universal-plugin/src/publish/sync-version.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncVersion } from './sync-version.js'

let dir: string

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-plugin-syncver-'))
	fs.mkdirSync(path.join(dir, '.plugin'))
})

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true })
})

function writeManifest(manifest: object) {
	fs.writeFileSync(path.join(dir, '.plugin', 'plugin.json'), JSON.stringify(manifest))
}

function writePackage(relFolder: string, pkg: object) {
	fs.mkdirSync(path.join(dir, relFolder), { recursive: true })
	fs.writeFileSync(path.join(dir, relFolder, 'package.json'), JSON.stringify(pkg))
}

function readManifest(): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(path.join(dir, '.plugin', 'plugin.json'), 'utf8')) as Record<string, unknown>
}

describe('syncVersion', () => {
	it('throws when .plugin/plugin.json is missing', () => {
		const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-plugin-empty-'))
		try {
			expect(() => syncVersion(empty)).toThrow(/No .plugin\/plugin.json/)
		} finally {
			fs.rmSync(empty, { recursive: true, force: true })
		}
	})

	it('throws when packagePath is missing from manifest', () => {
		writeManifest({ name: 'my-plugin' })
		expect(() => syncVersion(dir)).toThrow(/packagePath is required/)
	})

	it('throws when packagePath/package.json does not exist', () => {
		writeManifest({ name: 'my-plugin', packagePath: 'packages/missing' })
		expect(() => syncVersion(dir)).toThrow(/No package.json found at packages\/missing/)
	})

	it('throws when packagePath/package.json has no version', () => {
		writeManifest({ name: 'my-plugin', packagePath: 'packages/mypkg' })
		writePackage('packages/mypkg', { name: 'mypkg' })
		expect(() => syncVersion(dir)).toThrow(/No version found in packages\/mypkg\/package.json/)
	})

	it('writes version from packagePath into .plugin/plugin.json', () => {
		writeManifest({ name: 'my-plugin', packagePath: 'packages/mypkg' })
		writePackage('packages/mypkg', { name: 'mypkg', version: '1.2.3' })
		const result = syncVersion(dir)
		expect(result.version).toBe('1.2.3')
		expect(readManifest().version).toBe('1.2.3')
	})

	it('preserves all other fields when writing', () => {
		writeManifest({ name: 'my-plugin', description: 'desc', packagePath: 'packages/mypkg' })
		writePackage('packages/mypkg', { version: '2.0.0' })
		syncVersion(dir)
		const manifest = readManifest()
		expect(manifest.name).toBe('my-plugin')
		expect(manifest.description).toBe('desc')
		expect(manifest.packagePath).toBe('packages/mypkg')
	})

	it('returns manifestPath pointing to .plugin/plugin.json', () => {
		writeManifest({ name: 'x', packagePath: 'pkg' })
		writePackage('pkg', { version: '0.1.0' })
		const result = syncVersion(dir)
		expect(result.manifestPath).toBe(path.join(dir, '.plugin', 'plugin.json'))
	})
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/universal-plugin && pnpm exec vitest run src/publish/sync-version.test.ts
```

Expected: FAIL with "Cannot find module './sync-version.js'"

---

## Task 3: Implement `syncVersion` (green)

**Files:**
- Create: `packages/universal-plugin/src/publish/sync-version.ts`

- [ ] **Step 1: Create the implementation**

```typescript
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface SyncVersionResult {
	version: string
	manifestPath: string
}

export function syncVersion(root: string): SyncVersionResult {
	const manifestPath = path.join(root, '.plugin', 'plugin.json')
	if (!fs.existsSync(manifestPath)) {
		throw new Error(`No .plugin/plugin.json found at ${root}`)
	}

	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>

	const packagePath = manifest['packagePath']
	if (!packagePath || typeof packagePath !== 'string') {
		throw new Error('packagePath is required in .plugin/plugin.json')
	}

	const pkgJsonPath = path.join(root, packagePath, 'package.json')
	if (!fs.existsSync(pkgJsonPath)) {
		throw new Error(`No package.json found at ${packagePath}`)
	}

	const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>
	const version = pkg['version']
	if (!version || typeof version !== 'string') {
		throw new Error(`No version found in ${packagePath}/package.json`)
	}

	const updated = { ...manifest, version }
	fs.writeFileSync(manifestPath, `${JSON.stringify(updated, null, '\t')}\n`)

	return { version, manifestPath }
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/universal-plugin && pnpm exec vitest run src/publish/sync-version.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/universal-plugin/src/publish/sync-version.ts packages/universal-plugin/src/publish/sync-version.test.ts
git commit -m "feat: add syncVersion core logic for publish sync-version command"
```

---

## Task 4: Wire the CLI command

**Files:**
- Create: `packages/universal-plugin/src/publish/cli.ts`
- Modify: `packages/universal-plugin/src/cli.ts`

- [ ] **Step 1: Create `publish/cli.ts`**

```typescript
import { Command } from 'commander'

import { ROOT_OPTION, resolveRoot } from '../cli-options.js'
import { output, printFields } from '../output.js'
import { syncVersion } from './sync-version.js'

export function publishCommand(): Command {
	const cmd = new Command('publish').description('Prepare plugin for publishing').helpCommand(false)

	cmd
		.command('sync-version')
		.description('Sync version from packagePath/package.json into .plugin/plugin.json')
		.addOption(ROOT_OPTION)
		.action((opts: { root?: string }) => {
			try {
				const result = syncVersion(resolveRoot(opts.root))
				output(result, () => {
					printFields({ version: result.version, manifest: result.manifestPath })
				})
			} catch (err) {
				process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
				process.exit(1)
			}
		})

	return cmd
}
```

- [ ] **Step 2: Register `publishCommand` in `src/cli.ts`**

Current `src/cli.ts` (relevant lines):

```typescript
import { cleanCommand } from './asset-store/cli.js'
import { buildCommand } from './build/cli.js'
import { governanceCommand } from './governance/cli.js'
import { prepareCommand } from './prepare/cli.js'
import { selfUpdateCommand } from './self-update/cli.js'
import { syncCommand } from './sync/cli.js'
```

Add the import and `addCommand` call:

```typescript
import { cleanCommand } from './asset-store/cli.js'
import { buildCommand } from './build/cli.js'
import { governanceCommand } from './governance/cli.js'
import { prepareCommand } from './prepare/cli.js'
import { publishCommand } from './publish/cli.js'
import { selfUpdateCommand } from './self-update/cli.js'
import { syncCommand } from './sync/cli.js'
```

And add after the existing `addCommand` calls:

```typescript
program.addCommand(buildCommand())
program.addCommand(cleanCommand())
program.addCommand(governanceCommand())
program.addCommand(prepareCommand())
program.addCommand(publishCommand())
program.addCommand(syncCommand())
program.addCommand(selfUpdateCommand())
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd packages/universal-plugin && pnpm typecheck
```

Expected: no errors

---

## Task 5: Add CLI integration tests and commit

**Files:**
- Modify: `packages/universal-plugin/src/bin/universal-plugin.test.mts`

- [ ] **Step 1: Add integration tests**

Append to `packages/universal-plugin/src/bin/universal-plugin.test.mts`:

```typescript
test('publish sync-version writes version from packagePath into .plugin/plugin.json', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-plugin-syncver-'))
	try {
		fs.mkdirSync(path.join(root, '.plugin'))
		fs.mkdirSync(path.join(root, 'pkg'), { recursive: true })
		fs.writeFileSync(
			path.join(root, '.plugin', 'plugin.json'),
			JSON.stringify({ name: 'test-plugin', packagePath: 'pkg' }),
		)
		fs.writeFileSync(path.join(root, 'pkg', 'package.json'), JSON.stringify({ version: '3.1.0' }))
		const result = spawnSync('node', [bin, 'publish', 'sync-version', '--root', root], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(0)
		const manifest = JSON.parse(fs.readFileSync(path.join(root, '.plugin', 'plugin.json'), 'utf8')) as Record<string, unknown>
		expect(manifest['version']).toBe('3.1.0')
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test('publish sync-version exits 1 when packagePath is missing from manifest', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-plugin-syncver-'))
	try {
		fs.mkdirSync(path.join(root, '.plugin'))
		fs.writeFileSync(
			path.join(root, '.plugin', 'plugin.json'),
			JSON.stringify({ name: 'test-plugin' }),
		)
		const result = spawnSync('node', [bin, 'publish', 'sync-version', '--root', root], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(1)
		expect(result.stderr).toMatch(/packagePath is required/)
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
})
```

- [ ] **Step 2: Run the full test suite (builds first, then tests)**

```bash
cd packages/universal-plugin && pnpm test
```

Expected: all tests PASS (the test script runs `pnpm build` first, then `vitest run src`, so the binary is up to date)

- [ ] **Step 3: Commit**

```bash
git add packages/universal-plugin/src/publish/cli.ts packages/universal-plugin/src/cli.ts packages/universal-plugin/src/bin/universal-plugin.test.mts
git commit -m "feat: add publish sync-version CLI command"
```

---

## Task 6: Add dogfooding scripts to root `package.json`

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update scripts**

Current `"version"` script: `"changeset version"`

Replace with:
```json
"version": "changeset version && pnpm --filter universal-plugin exec tsx src/cli.ts publish sync-version --root ../...",
"plugin:build": "pnpm --filter universal-plugin exec tsx src/cli.ts build --root ../.."
```

The full `scripts` block after change:

```json
"scripts": {
  "build": "turbo build",
  "check": "biome check --write",
  "cs": "changeset",
  "dev": "pnpm --filter universal-plugin dev",
  "format": "biome format --write .",
  "plugin:build": "pnpm --filter universal-plugin exec tsx src/cli.ts build --root ../..",
  "prepare": "node -e \"if(!(process.env.CI||process.env.GITHUB_ACTIONS))require('child_process').execSync('husky',{stdio:'inherit'})\"",
  "release": "changeset publish",
  "test": "turbo test",
  "typecheck": "turbo typecheck",
  "verify": "turbo verify",
  "version": "changeset version && pnpm --filter universal-plugin exec tsx src/cli.ts publish sync-version --root ../..",
  "web": "pnpm --filter web"
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add plugin:build script and wire publish sync-version into version hook"
```

---

## Task 7: Smoke test dogfooding

- [ ] **Step 1: Run `plugin:build` in dry-run mode**

```bash
pnpm plugin:build -- --dry-run --verbose
```

Expected output includes:
```
vendors  claude-code, cursor, codex, copilot-cli
OUTPUT
------
(dry-run) .claude-plugin/plugin.json
(dry-run) .cursor-plugin/plugin.json
(dry-run) .codex-plugin/plugin.json
(dry-run) plugin.json
```

Note: the `--` passes remaining args to the inner tsx call. If the shell doesn't forward them, run the tsx command directly:

```bash
pnpm --filter universal-plugin exec tsx src/cli.ts build --root ../.. --dry-run --verbose
```

- [ ] **Step 2: Run `plugin:build` for real**

```bash
pnpm plugin:build
```

Expected: four files written. Verify they exist:

```bash
cat .claude-plugin/plugin.json
cat .codex-plugin/plugin.json
```

The `codex` manifest should include a `version` field (from the current `packages/universal-plugin/package.json`).

- [ ] **Step 3: Commit generated manifests if they should be checked in, or add them to `.gitignore`**

Check with the user whether `.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`, and root `plugin.json` should be committed or gitignored. If gitignored:

```bash
echo ".claude-plugin/" >> .gitignore
echo ".cursor-plugin/" >> .gitignore
echo ".codex-plugin/" >> .gitignore
echo "plugin.json" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore generated vendor plugin manifests"
```

If committed (so the repo doubles as an installable plugin):

```bash
git add .claude-plugin/ .cursor-plugin/ .codex-plugin/ plugin.json
git commit -m "chore: generate vendor plugin manifests via plugin:build"
```
