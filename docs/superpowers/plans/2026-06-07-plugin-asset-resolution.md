# Plugin Asset Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a vendor-neutral asset store (`~/.agents/.universal-plugin/plugins/`) so `governance show plugin-name/asset-name` resolves plugin assets without vendor-specific path knowledge or process detection.

**Architecture:** `prepare` discovers installed plugins via the vendor registry, writes a plugin index (`plugins`/`assets` keys) to the state JSON, and copies asset directories into a versioned flat store. `governance show` parses namespaced names, looks up the plugin in the `assets` index, and resolves from the store. A new `clean` command removes the store.

**Tech Stack:** Node.js, TypeScript, vitest, commander, node:crypto (SHA-256), node:fs (recursive copy)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/vendor-registry/vendor-registry.ts` | Modify | Add `pluginRootSuffix` field to `VendorConfig` |
| `src/vendor-registry/data/vendors.json` | Modify | Add `pluginRootSuffix` values per vendor |
| `src/vendor-registry/vendor-registry.test.ts` | Modify | Update fixture with new field |
| `src/state/state.ts` | Modify | Add `PluginIndexEntry`, `AssetIndexEntry`, extend `StateFile` |
| `src/state/state.test.ts` | Modify | Add tests for new state helpers |
| `src/source-registry/source-registry.ts` | Create | Store path derivation, SHA-8, source type detection |
| `src/source-registry/source-registry.test.ts` | Create | Tests for store path logic |
| `src/source-registry/fs.ts` | Create | Load `sources.json` from disk |
| `src/asset-store/asset-store.ts` | Create | Store root paths, entry path, asset type dirs |
| `src/asset-store/asset-store.test.ts` | Create | Tests for store path helpers |
| `src/asset-store/fs.ts` | Create | Populate store from vendor cache, clean store |
| `src/asset-store/cli.ts` | Create | `universal-plugin clean` command |
| `src/prepare/fs.ts` | Modify | Add `readPluginRoots()` to `PrepareFs` |
| `src/prepare/prepare.ts` | Modify | Write plugin index + trigger store population |
| `src/prepare/prepare.test.ts` | Modify | Add tests for index writing and store population |
| `src/governance/governance.ts` | Modify | Parse namespaced names, resolve from store |
| `src/governance/governance.test.ts` | Modify | Add namespaced resolution tests |
| `src/governance/cli.ts` | Modify | Load state and pass to `showGovernance` |
| `src/cli.ts` | Modify | Register `cleanCommand` |

---

### Task 1: Add `pluginRootSuffix` to vendor registry

**Files:**
- Modify: `src/vendor-registry/vendor-registry.ts`
- Modify: `src/vendor-registry/data/vendors.json`
- Modify: `src/vendor-registry/vendor-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/vendor-registry/vendor-registry.test.ts` after the existing `claudeCode` fixture:

```ts
it('claudeCode fixture has pluginRootSuffix', () => {
  expect(claudeCode.pluginRootSuffix).toBe('.claude-plugin/plugin.json')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/universal-plugin && pnpm test --run vendor-registry
```

Expected: FAIL — property `pluginRootSuffix` does not exist on type `VendorConfig`

- [ ] **Step 3: Add field to `VendorConfig` type**

In `src/vendor-registry/vendor-registry.ts`, add `pluginRootSuffix` to the interface:

```ts
export interface VendorConfig {
  sessionStartEvent: string
  globalManifest: string | null
  projectManifest: string | null
  hookGlob: string | null
  globalPluginDir: string | null
  pluginRootSuffix: string | null
  installCommand: string | null
  removeCommand: string | null
  updateCommand: string | null
}
```

- [ ] **Step 4: Update vendors.json with suffix values**

```json
{
  "claude-code": {
    "sessionStartEvent": "SessionStart",
    "globalManifest": "~/.claude/plugins/installed_plugins.json",
    "projectManifest": null,
    "hookGlob": "~/.claude/plugins/universal-plugin/hooks/hooks.json",
    "globalPluginDir": "~/.claude/plugins/",
    "pluginRootSuffix": ".claude-plugin/plugin.json",
    "installCommand": "claude plugin install {name}",
    "removeCommand": "claude plugin remove {name}",
    "updateCommand": "claude plugin update {name}@{version}"
  },
  "cursor": {
    "sessionStartEvent": "sessionStart",
    "globalManifest": null,
    "projectManifest": null,
    "hookGlob": null,
    "globalPluginDir": null,
    "pluginRootSuffix": ".cursor-plugin/plugin.json",
    "installCommand": null,
    "removeCommand": null,
    "updateCommand": null
  },
  "codex": {
    "sessionStartEvent": "SessionStart",
    "globalManifest": null,
    "projectManifest": null,
    "hookGlob": null,
    "globalPluginDir": null,
    "pluginRootSuffix": ".codex-plugin/plugin.json",
    "installCommand": null,
    "removeCommand": null,
    "updateCommand": null
  },
  "copilot-cli": {
    "sessionStartEvent": "sessionStart",
    "globalManifest": null,
    "projectManifest": null,
    "hookGlob": null,
    "globalPluginDir": null,
    "pluginRootSuffix": "plugin.json",
    "installCommand": null,
    "removeCommand": null,
    "updateCommand": null
  }
}
```

- [ ] **Step 5: Update the test fixture to include the new field**

In `src/vendor-registry/vendor-registry.test.ts`, update `claudeCode`:

```ts
const claudeCode: VendorConfig = {
  sessionStartEvent: 'SessionStart',
  globalManifest: '~/.claude/plugins/installed_plugins.json',
  projectManifest: null,
  hookGlob: '~/.claude/plugins/universal-plugin/hooks/hooks.json',
  globalPluginDir: '~/.claude/plugins/',
  pluginRootSuffix: '.claude-plugin/plugin.json',
  installCommand: 'claude plugin install {name}',
  removeCommand: 'claude plugin remove {name}',
  updateCommand: 'claude plugin update {name}@{version}',
}
```

- [ ] **Step 6: Run tests and verify they pass**

```bash
cd packages/universal-plugin && pnpm test --run vendor-registry
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/universal-plugin/src/vendor-registry/vendor-registry.ts \
        packages/universal-plugin/src/vendor-registry/data/vendors.json \
        packages/universal-plugin/src/vendor-registry/vendor-registry.test.ts
git commit -m "feat(vendor-registry): add pluginRootSuffix field"
```

---

### Task 2: Add `plugins` and `assets` to state schema

**Files:**
- Modify: `src/state/state.ts`
- Modify: `src/state/state.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/state/state.test.ts`:

```ts
describe('emptyState plugins and assets', () => {
  it('has empty plugins and assets maps', () => {
    const s = emptyState()
    expect(s.plugins).toEqual({})
    expect(s.assets).toEqual({})
  })
})

describe('writePluginIndex', () => {
  it('sets plugin entry for vendor and plugin name', () => {
    const s = emptyState()
    const updated = writePluginIndex(s, 'claude-code', 'universal-plugin', {
      source: 'npm',
      path: '~/.claude/plugins/universal-plugin',
      version: '1.2.3',
    })
    expect(updated.plugins['claude-code']!['universal-plugin']).toEqual({
      source: 'npm',
      path: '~/.claude/plugins/universal-plugin',
      version: '1.2.3',
    })
  })

  it('does not mutate other vendor entries', () => {
    let s = emptyState()
    s = writePluginIndex(s, 'claude-code', 'universal-plugin', {
      source: 'npm',
      path: '~/.claude/plugins/universal-plugin',
      version: '1.2.3',
    })
    s = writePluginIndex(s, 'cursor', 'universal-plugin', {
      source: 'npm',
      path: '~/.cursor/extensions/universal-plugin',
      version: '1.2.3',
    })
    expect(s.plugins['claude-code']!['universal-plugin']!.path).toBe('~/.claude/plugins/universal-plugin')
    expect(s.plugins['cursor']!['universal-plugin']!.path).toBe('~/.cursor/extensions/universal-plugin')
  })
})

describe('writeAssetIndex', () => {
  it('sets asset entry for plugin name', () => {
    const s = emptyState()
    const updated = writeAssetIndex(s, 'universal-plugin', { source: 'npm', version: '1.2.3' })
    expect(updated.assets['universal-plugin']).toEqual({ source: 'npm', version: '1.2.3' })
  })
})
```

Also add `writePluginIndex` and `writeAssetIndex` to the import line at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/universal-plugin && pnpm test --run state
```

Expected: FAIL — `writePluginIndex` and `writeAssetIndex` not exported

- [ ] **Step 3: Add types and functions to `src/state/state.ts`**

```ts
export interface PluginIndexEntry {
  source: string
  path: string
  version: string
}

export interface AssetIndexEntry {
  source: string
  version: string
}

export interface StateFile {
  schemaVersion: 1
  snapshots: Record<string, Record<string, ScopeSnapshot>>
  dismissed: Record<string, DismissedEntry>
  pendingActions: PendingAction[]
  uniPluginUpdates: Record<string, UniPluginUpdateEntry>
  plugins: Record<string, Record<string, PluginIndexEntry>>
  assets: Record<string, AssetIndexEntry>
}

export function emptyState(): StateFile {
  return {
    schemaVersion: 1,
    snapshots: {},
    dismissed: {},
    pendingActions: [],
    uniPluginUpdates: {},
    plugins: {},
    assets: {},
  }
}

export function writePluginIndex(
  state: StateFile,
  vendorId: string,
  pluginName: string,
  entry: PluginIndexEntry,
): StateFile {
  return {
    ...state,
    plugins: {
      ...state.plugins,
      [vendorId]: {
        ...(state.plugins[vendorId] ?? {}),
        [pluginName]: entry,
      },
    },
  }
}

export function writeAssetIndex(
  state: StateFile,
  pluginName: string,
  entry: AssetIndexEntry,
): StateFile {
  return {
    ...state,
    assets: {
      ...state.assets,
      [pluginName]: entry,
    },
  }
}
```

Also update `mergeSafeState` to forward the new fields:

```ts
export function mergeSafeState(raw: StateFile): StateFile {
  return {
    ...raw,
    plugins: raw.plugins ?? {},
    assets: raw.assets ?? {},
    pendingActions: (raw.pendingActions ?? []).filter((a) => KNOWN_ACTION_TYPES.has(a.type)),
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd packages/universal-plugin && pnpm test --run state
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/universal-plugin/src/state/state.ts \
        packages/universal-plugin/src/state/state.test.ts
git commit -m "feat(state): add plugins and assets index to state schema"
```

---

### Task 3: Source registry — store path derivation

**Files:**
- Create: `src/source-registry/source-registry.ts`
- Create: `src/source-registry/source-registry.test.ts`
- Create: `src/source-registry/fs.ts`

- [ ] **Step 1: Write failing tests**

Create `src/source-registry/source-registry.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  getStoreSegment,
  resolveSourceType,
  sha8,
} from './source-registry.js'
import type { SourcesConfig } from './source-registry.js'

const defaultSources: SourcesConfig = {
  handlers: {
    github: { hosts: ['github.com'] },
    gitlab: { hosts: ['gitlab.com'] },
    npm: { registries: ['https://registry.npmjs.org'] },
  },
}

describe('sha8', () => {
  it('returns first 8 hex chars of SHA-256 of input', () => {
    const expected = createHash('sha256').update('https://example.com/org/repo').digest('hex').slice(0, 8)
    expect(sha8('https://example.com/org/repo')).toBe(expected)
  })
})

describe('resolveSourceType', () => {
  it('returns github for github.com', () => {
    expect(resolveSourceType('github.com', defaultSources)).toBe('github')
  })

  it('returns gitlab for gitlab.com', () => {
    expect(resolveSourceType('gitlab.com', defaultSources)).toBe('gitlab')
  })

  it('returns url for unrecognized host', () => {
    expect(resolveSourceType('example.com', defaultSources)).toBe('url')
  })

  it('returns github for registered enterprise instance', () => {
    const sources: SourcesConfig = {
      handlers: {
        github: { hosts: ['github.com', 'github.mycompany.com'] },
        gitlab: { hosts: ['gitlab.com'] },
        npm: { registries: ['https://registry.npmjs.org'] },
      },
    }
    expect(resolveSourceType('github.mycompany.com', sources)).toBe('github')
  })
})

describe('getStoreSegment', () => {
  it('npm unscoped: npm/plugin-name@version', () => {
    expect(getStoreSegment('npm', 'universal-plugin', '1.2.3', defaultSources)).toBe(
      'npm/universal-plugin@1.2.3',
    )
  })

  it('npm scoped: npm/@scope/name@version', () => {
    expect(getStoreSegment('npm', '@cyberuni/universal-plugin', '1.2.3', defaultSources)).toBe(
      'npm/@cyberuni/universal-plugin@1.2.3',
    )
  })

  it('github: github.com/owner/repo@version', () => {
    expect(getStoreSegment('github.com/cyberuni/universal-plugin', 'universal-plugin', '1.2.3', defaultSources)).toBe(
      'github.com/cyberuni/universal-plugin@1.2.3',
    )
  })

  it('url: url/name-sha8@version for unrecognized host', () => {
    const url = 'https://example.com/org/repo'
    const hash = sha8(url)
    expect(getStoreSegment(url, 'universal-plugin', '1.2.3', defaultSources)).toBe(
      `url/universal-plugin-${hash}@1.2.3`,
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/universal-plugin && pnpm test --run source-registry
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/source-registry/source-registry.ts`**

```ts
import { createHash } from 'node:crypto'

export interface SourceHandlerConfig {
  hosts?: string[]
  registries?: string[]
}

export interface SourcesConfig {
  handlers: {
    github?: SourceHandlerConfig
    gitlab?: SourceHandlerConfig
    npm?: SourceHandlerConfig
    [key: string]: SourceHandlerConfig | undefined
  }
}

export const DEFAULT_SOURCES: SourcesConfig = {
  handlers: {
    github: { hosts: ['github.com'] },
    gitlab: { hosts: ['gitlab.com'] },
    npm: { registries: ['https://registry.npmjs.org'] },
  },
}

export function sha8(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

export function resolveSourceType(host: string, sources: SourcesConfig): string {
  for (const [type, config] of Object.entries(sources.handlers)) {
    if (config?.hosts?.includes(host)) return type
  }
  return 'url'
}

export function getStoreSegment(
  source: string,
  pluginName: string,
  version: string,
  sources: SourcesConfig,
): string {
  // npm source (starts with 'npm' or is a scoped/unscoped package name)
  if (source === 'npm') {
    return `npm/${pluginName}@${version}`
  }

  // Try to parse as a URL or host/owner/repo
  let host: string
  let repoPath: string

  if (source.startsWith('https://') || source.startsWith('http://')) {
    const url = new URL(source)
    host = url.hostname
    repoPath = url.pathname.replace(/^\//, '')
  } else if (source.includes('/')) {
    // owner/repo or host/owner/repo format
    const parts = source.split('/')
    if (parts.length === 2) {
      // owner/repo shorthand — defaults to github.com
      const githubHosts = sources.handlers.github?.hosts ?? ['github.com']
      host = githubHosts[0] ?? 'github.com'
      repoPath = source
    } else {
      host = parts[0]!
      repoPath = parts.slice(1).join('/')
    }
  } else {
    host = source
    repoPath = pluginName
  }

  const sourceType = resolveSourceType(host, sources)
  if (sourceType === 'url') {
    return `url/${pluginName}-${sha8(source)}@${version}`
  }

  return `${host}/${repoPath}@${version}`
}
```

- [ ] **Step 4: Create `src/source-registry/fs.ts`**

```ts
import * as fsNode from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { DEFAULT_SOURCES } from './source-registry.js'
import type { SourcesConfig } from './source-registry.js'

function sourcesConfigPath(): string {
  return path.join(os.homedir(), '.agents', '.universal-plugin', 'sources.json')
}

export function loadSourcesConfig(): SourcesConfig {
  try {
    return JSON.parse(fsNode.readFileSync(sourcesConfigPath(), 'utf8')) as SourcesConfig
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_SOURCES
    throw err
  }
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
cd packages/universal-plugin && pnpm test --run source-registry
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/universal-plugin/src/source-registry/
git commit -m "feat(source-registry): add store path derivation and source type detection"
```

---

### Task 4: Asset store fs helpers

**Files:**
- Create: `src/asset-store/asset-store.ts`
- Create: `src/asset-store/asset-store.test.ts`
- Create: `src/asset-store/fs.ts`

- [ ] **Step 1: Write failing tests**

Create `src/asset-store/asset-store.test.ts`:

```ts
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ASSET_DIRS,
  globalStorePath,
  projectStorePath,
  storeEntryPath,
} from './asset-store.js'

describe('globalStorePath', () => {
  it('returns ~/.agents/.universal-plugin/plugins/', () => {
    expect(globalStorePath()).toBe(
      path.join(os.homedir(), '.agents', '.universal-plugin', 'plugins'),
    )
  })
})

describe('projectStorePath', () => {
  it('returns <root>/.agents/.universal-plugin/plugins/', () => {
    expect(projectStorePath('/my/project')).toBe(
      '/my/project/.agents/.universal-plugin/plugins',
    )
  })
})

describe('storeEntryPath', () => {
  it('joins store root with segment', () => {
    expect(storeEntryPath('/store', 'npm/universal-plugin@1.2.3')).toBe(
      '/store/npm/universal-plugin@1.2.3',
    )
  })
})

describe('ASSET_DIRS', () => {
  it('includes governances, disciplines, guidelines, templates', () => {
    expect(ASSET_DIRS).toContain('governances')
    expect(ASSET_DIRS).toContain('disciplines')
    expect(ASSET_DIRS).toContain('guidelines')
    expect(ASSET_DIRS).toContain('templates')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/universal-plugin && pnpm test --run asset-store
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/asset-store/asset-store.ts`**

```ts
import * as os from 'node:os'
import * as path from 'node:path'

export const ASSET_DIRS = ['governances', 'disciplines', 'guidelines', 'templates'] as const
export type AssetDir = (typeof ASSET_DIRS)[number]

export function globalStorePath(): string {
  return path.join(os.homedir(), '.agents', '.universal-plugin', 'plugins')
}

export function projectStorePath(root: string): string {
  return path.join(root, '.agents', '.universal-plugin', 'plugins')
}

export function storeEntryPath(storePath: string, segment: string): string {
  return path.join(storePath, segment)
}
```

- [ ] **Step 4: Create `src/asset-store/fs.ts`**

```ts
import * as fsNode from 'node:fs'
import * as path from 'node:path'
import { ASSET_DIRS } from './asset-store.js'

export function entryExists(entryPath: string): boolean {
  return fsNode.existsSync(entryPath)
}

export function populateEntry(entryPath: string, pluginRoot: string): void {
  for (const dir of ASSET_DIRS) {
    const src = path.join(pluginRoot, dir)
    const dest = path.join(entryPath, dir)
    if (!fsNode.existsSync(src)) continue
    fsNode.mkdirSync(dest, { recursive: true })
    for (const file of fsNode.readdirSync(src)) {
      fsNode.copyFileSync(path.join(src, file), path.join(dest, file))
    }
  }
}

export function removeStore(storePath: string): void {
  fsNode.rmSync(storePath, { recursive: true, force: true })
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
cd packages/universal-plugin && pnpm test --run asset-store
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/universal-plugin/src/asset-store/
git commit -m "feat(asset-store): add store path helpers and fs operations"
```

---

### Task 5: Update `prepare` to write plugin index and populate store

**Files:**
- Modify: `src/prepare/fs.ts`
- Modify: `src/prepare/prepare.ts`
- Modify: `src/prepare/prepare.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/prepare/prepare.test.ts` (after existing imports, add `writePluginIndex`, `writeAssetIndex` to state imports):

```ts
import { writePluginIndex, writeAssetIndex } from '../state/state.js'

// Add new describe block:
describe('runPrepare plugin index', () => {
  it('writes plugin entry to state when plugin roots are provided', () => {
    const pluginRoots = { 'universal-plugin': '/home/user/.claude/plugins/universal-plugin' }
    const capturedStates: StateFile[] = []
    const fs: PrepareFs = {
      readManifest: () => ({ 'universal-plugin': '1.2.3' }),
      readPluginRoots: () => pluginRoots,
      readGlobalState: () => emptyState(),
      readProjectState: () => null,
      writeGlobalState: (s) => capturedStates.push(s),
      writeProjectState: () => {},
    }
    runPrepare({ vendorId: 'claude-code', scope: 'global', fs, now: '2026-01-01T00:00:00Z' })
    expect(capturedStates[0]!.plugins['claude-code']!['universal-plugin']).toMatchObject({
      version: '1.2.3',
    })
    expect(capturedStates[0]!.assets['universal-plugin']).toMatchObject({ version: '1.2.3' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/universal-plugin && pnpm test --run prepare
```

Expected: FAIL — `readPluginRoots` does not exist on `PrepareFs`

- [ ] **Step 3: Add `readPluginRoots` to `PrepareFs` interface in `src/prepare/fs.ts`**

```ts
export interface PrepareFs {
  readManifest(): Record<string, string>
  readPluginRoots(): Record<string, string>
  readGlobalState(): StateFile
  readProjectState(): StateFile | null
  writeGlobalState(state: StateFile): void
  writeProjectState(state: StateFile): void
}
```

Also implement `readPluginRoots` in `realPrepareFs`:

```ts
readPluginRoots(): Record<string, string> {
  if (!vendor.globalPluginDir) return {}
  const pluginDir = vendor.globalPluginDir.replace('~', os.homedir())
  const manifest = this.readManifest()
  return Object.fromEntries(
    Object.keys(manifest).map((name) => [name, path.join(pluginDir, name)])
  )
},
```

- [ ] **Step 4: Update `runPrepare` in `src/prepare/prepare.ts` to write the plugin index**

Add imports at top:

```ts
import { addPendingAction, emptyState, takeSnapshot, writeAssetIndex, writePluginIndex } from '../state/state.js'
```

Update `runPrepare` to accept plugin roots and write index:

```ts
export function runPrepare(opts: PrepareOptions): PrepareResult {
  const { vendorId, scope, fs: prepareFs, now, dryRun } = opts

  const currentPlugins = prepareFs.readManifest()
  const pluginRoots = prepareFs.readPluginRoots()
  const state =
    scope === 'global'
      ? prepareFs.readGlobalState()
      : (prepareFs.readProjectState() ?? emptyState())

  const actions = computeDelta({ vendorId, scope, currentPlugins, state, now })

  let updatedState = takeSnapshot(state, vendorId, scope, currentPlugins, now)
  for (const action of actions) {
    updatedState = addPendingAction(updatedState, action)
  }

  for (const [pluginName, pluginPath] of Object.entries(pluginRoots)) {
    const version = currentPlugins[pluginName] ?? 'unknown'
    const relativePath = pluginPath.replace(os.homedir(), '~')
    updatedState = writePluginIndex(updatedState, vendorId, pluginName, {
      source: 'npm',
      path: relativePath,
      version,
    })
    updatedState = writeAssetIndex(updatedState, pluginName, { source: 'npm', version })
  }

  if (!dryRun) {
    if (scope === 'global') prepareFs.writeGlobalState(updatedState)
    else prepareFs.writeProjectState(updatedState)
  }

  return { newActionCount: actions.length }
}
```

Also add `import * as os from 'node:os'` at the top of `prepare.ts`.

- [ ] **Step 5: Update existing prepare test fixtures** to include `readPluginRoots: () => ({})` on any mock `PrepareFs` objects that don't have it yet.

Search `prepare.test.ts` for `PrepareFs` mock objects and add:
```ts
readPluginRoots: () => ({}),
```
to each one.

- [ ] **Step 6: Run tests and verify they pass**

```bash
cd packages/universal-plugin && pnpm test --run prepare
```

Expected: all tests PASS

- [ ] **Step 7: Add store population to `src/prepare/fs.ts`**

Add a `populateAssetStore` call in `realPrepareFs` after the state is written. Import at the top:

```ts
import { entryExists, populateEntry } from '../asset-store/fs.js'
import { globalStorePath } from '../asset-store/asset-store.js'
import { storeEntryPath } from '../asset-store/asset-store.js'
```

Add a separate exported function (not part of `PrepareFs` interface — side effect only):

```ts
export function populateStoreFromVendorCache(
  pluginRoots: Record<string, string>,
  versions: Record<string, string>,
): void {
  const storePath = globalStorePath()
  for (const [pluginName, pluginRoot] of Object.entries(pluginRoots)) {
    const version = versions[pluginName] ?? 'unknown'
    const segment = `npm/${pluginName}@${version}`
    const entryPath = storeEntryPath(storePath, segment)
    if (entryExists(entryPath)) continue
    populateEntry(entryPath, pluginRoot)
  }
}
```

- [ ] **Step 8: Call `populateStoreFromVendorCache` in `src/prepare/cli.ts`**

Read `src/prepare/cli.ts` first to understand where to add the call, then add after `runPrepare`:

```ts
import { populateStoreFromVendorCache, realPrepareFs } from './fs.js'
// ...
const prepareFs = realPrepareFs(vendor, root)
const result = runPrepare({ vendorId, scope: 'global', fs: prepareFs, now })
populateStoreFromVendorCache(prepareFs.readPluginRoots(), prepareFs.readManifest())
```

- [ ] **Step 9: Run full test suite**

```bash
cd packages/universal-plugin && pnpm test --run
```

Expected: all tests PASS

- [ ] **Step 10: Commit**

```bash
git add packages/universal-plugin/src/prepare/fs.ts \
        packages/universal-plugin/src/prepare/prepare.ts \
        packages/universal-plugin/src/prepare/prepare.test.ts \
        packages/universal-plugin/src/prepare/cli.ts
git commit -m "feat(prepare): write plugin index and populate asset store"
```

---

### Task 6: Namespaced governance resolution

**Files:**
- Modify: `src/governance/governance.ts`
- Modify: `src/governance/governance.test.ts`
- Modify: `src/governance/cli.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/governance/governance.test.ts`:

```ts
import type { StateFile } from '../state/state.js'
import { emptyState, writeAssetIndex } from '../state/state.js'

// Helper
function stateWithPlugin(pluginName: string, storePath: string): StateFile {
  return writeAssetIndex(emptyState(), pluginName, { source: 'npm', version: '1.2.3' })
}

describe('showGovernance — namespaced name', () => {
  it('resolves plugin-name/governance-name from asset store', () => {
    const state = stateWithPlugin('universal-plugin', '/store')
    const storePath = '/store'
    const entryPath = '/store/npm/universal-plugin@1.2.3/governances/plugin-design.md'
    const govFs = makeMockFs({ [entryPath]: '# Plugin Design\ncontent' })

    const result = showGovernance('universal-plugin/plugin-design', ROOT, govFs, { state, globalStorePath: storePath })

    expect(result).not.toBeNull()
    expect(result!.scope).toBe('store')
    expect(result!.content).toBe('# Plugin Design\ncontent')
  })

  it('returns null when plugin not in asset index', () => {
    const govFs = makeMockFs({})
    const result = showGovernance('unknown-plugin/policy', ROOT, govFs, {
      state: emptyState(),
      globalStorePath: '/store',
    })
    expect(result).toBeNull()
  })

  it('project scope overrides store for namespaced name', () => {
    const state = stateWithPlugin('universal-plugin', '/store')
    const projectFile = '/fake/project/governances/universal-plugin/plugin-design.md'
    const storeFile = '/store/npm/universal-plugin@1.2.3/governances/plugin-design.md'
    const govFs = makeMockFs({
      [projectFile]: '# Override',
      [storeFile]: '# Original',
    })

    const result = showGovernance('universal-plugin/plugin-design', ROOT, govFs, {
      state,
      globalStorePath: '/store',
    })

    expect(result!.scope).toBe('project')
    expect(result!.content).toBe('# Override')
  })
})
```

Also update existing tests to pass the new optional argument:
```ts
// Existing calls: showGovernance('plugin-design', ROOT, govFs)
// No change needed — opts is optional
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/universal-plugin && pnpm test --run governance
```

Expected: FAIL — `showGovernance` does not accept 4th argument

- [ ] **Step 3: Update `src/governance/governance.ts`**

Add `'store'` to the `Scope` type and update `showGovernance`:

```ts
import type { StateFile } from '../state/state.js'

export type Scope = 'managed' | 'project' | 'user' | 'package' | 'store'

export interface AssetStoreOpts {
  state: StateFile
  globalStorePath: string
}

export function showGovernance(
  name: string,
  root: string,
  govFs: GovernanceFs,
  storeOpts?: AssetStoreOpts,
): ShowResult | null {
  // Namespaced: plugin-name/governance-name
  if (name.includes('/') && storeOpts) {
    const slashIdx = name.indexOf('/')
    const pluginName = name.slice(0, slashIdx)
    const assetName = name.slice(slashIdx + 1)

    // Scope chain: managed → project → user (allow overrides)
    for (const { scope, dir } of getScopedPaths(root).filter(s => s.scope !== 'package')) {
      const filePath = path.join(dir, `${name}.md`)
      if (govFs.exists(filePath)) return { content: govFs.read(filePath), scope }
    }

    // Store resolution
    const entry = storeOpts.state.assets[pluginName]
    if (!entry) return null
    const segment = `npm/${pluginName}@${entry.version}`
    const storePath = path.join(storeOpts.globalStorePath, segment, 'governances', `${assetName}.md`)
    if (govFs.exists(storePath)) return { content: govFs.read(storePath), scope: 'store' }
    return null
  }

  // Flat name: existing scope chain
  for (const { scope, dir } of getScopedPaths(root)) {
    const filePath = path.join(dir, `${name}.md`)
    if (govFs.exists(filePath)) return { content: govFs.read(filePath), scope }
  }
  return null
}
```

- [ ] **Step 4: Update `src/governance/cli.ts` to load state and store path**

```ts
import * as os from 'node:os'
import * as path from 'node:path'
import { mergeSafeState, emptyState } from '../state/state.js'
import { globalStorePath } from '../asset-store/asset-store.js'
import * as fsNode from 'node:fs'

function readGlobalState() {
  const p = path.join(os.homedir(), '.agents', 'universal-plugin.json')
  try {
    return mergeSafeState(JSON.parse(fsNode.readFileSync(p, 'utf8')))
  } catch {
    return emptyState()
  }
}

// In the 'show' action:
.action((name: string, opts: { root?: string }) => {
  const state = readGlobalState()
  const result = showGovernance(name, resolveRoot(opts.root), realGovernanceFs, {
    state,
    globalStorePath: globalStorePath(),
  })
  // ... rest unchanged
})
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
cd packages/universal-plugin && pnpm test --run governance
```

Expected: all tests PASS

- [ ] **Step 6: Run full test suite**

```bash
cd packages/universal-plugin && pnpm test --run
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/universal-plugin/src/governance/governance.ts \
        packages/universal-plugin/src/governance/governance.test.ts \
        packages/universal-plugin/src/governance/cli.ts
git commit -m "feat(governance): support namespaced plugin-name/asset-name resolution"
```

---

### Task 7: `clean` command

**Files:**
- Create: `src/asset-store/cli.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Create `src/asset-store/cli.ts`**

```ts
import { Command, Option } from 'commander'
import { ROOT_OPTION, resolveRoot } from '../cli-options.js'
import { globalStorePath, projectStorePath } from './asset-store.js'
import { removeStore } from './fs.js'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fsNode from 'node:fs'
import { mergeSafeState, emptyState } from '../state/state.js'

function globalStatePath(): string {
  return path.join(os.homedir(), '.agents', 'universal-plugin.json')
}

function clearStateIndex(statePath: string): void {
  try {
    const raw = JSON.parse(fsNode.readFileSync(statePath, 'utf8'))
    const state = mergeSafeState(raw)
    const cleared = { ...state, plugins: {}, assets: {} }
    fsNode.writeFileSync(statePath, JSON.stringify(cleared, null, 2) + '\n', 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

export function cleanCommand(): Command {
  return new Command('clean')
    .description('Remove the asset store')
    .addOption(new Option('--state', 'Also clear plugins and assets from state JSON'))
    .addOption(new Option('--scope <scope>', 'global or project').choices(['global', 'project']).default('global'))
    .addOption(ROOT_OPTION)
    .action((opts: { state?: boolean; scope: string; root?: string }) => {
      const storePath =
        opts.scope === 'project'
          ? projectStorePath(resolveRoot(opts.root))
          : globalStorePath()

      removeStore(storePath)
      process.stdout.write(`Removed ${storePath}\n`)

      if (opts.state) {
        clearStateIndex(globalStatePath())
        process.stdout.write('Cleared plugins and assets from state JSON\n')
      }
    })
}
```

- [ ] **Step 2: Wire into `src/cli.ts`**

```ts
import { cleanCommand } from './asset-store/cli.js'
// ...
program.addCommand(cleanCommand())
```

- [ ] **Step 3: Run the full test suite**

```bash
cd packages/universal-plugin && pnpm test --run
```

Expected: all tests PASS

- [ ] **Step 4: Smoke test the clean command**

```bash
cd packages/universal-plugin && node dist/cli.mjs clean --help
```

Expected output includes `--state` and `--scope` flags.

- [ ] **Step 5: Commit**

```bash
git add packages/universal-plugin/src/asset-store/cli.ts \
        packages/universal-plugin/src/cli.ts
git commit -m "feat(clean): add universal-plugin clean command to remove asset store"
```
