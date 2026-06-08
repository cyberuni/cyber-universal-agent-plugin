# uni-plugin Cross-Vendor Sync: CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `prepare`, `sync apply`, and `self-update` commands to `uni-plugin` CLI, backed by a vendor registry and shared state file, to enable cross-vendor plugin sync.

**Architecture:** Three new domains in `packages/uni-plugin/src/` following the existing clean + screaming architecture. Each domain has a pure logic layer (`<domain>.ts`), infrastructure adapters (`fs.ts`), and a CLI wiring layer (`cli.ts`). All business logic is testable without filesystem or network access via injected interfaces.

**Tech Stack:** TypeScript ESM, commander, vitest, tsdown, biome. Node ≥ 22. Run all commands from inside `packages/uni-plugin/`.

---

**Scope note:** This plan covers `packages/uni-plugin/` only. A follow-on plan covers `.plugin/` manifest, hook file generation via `uni-plugin build`, and `skills/sync/SKILL.md` + `skills/prepare/SKILL.md`.

**Vendor data note:** Manifest paths for Cursor, Codex, and Copilot CLI depend on the `plugin-consumption-leveling` research topic (not yet complete). The bundled `vendors.json` uses confirmed Claude Code values and `null` for other vendors; fill them in once that research is done.

---

## File Map

**New files:**

```
src/vendor-registry/
  vendor-registry.ts          ← types + lookup/merge (pure domain)
  vendor-registry.test.ts
  fs.ts                       ← load bundled JSON + merge user override
  data/
    vendors.json              ← bundled vendor configs

src/state/
  state.ts                    ← schema types + tolerant reader + mutation helpers (pure domain)
  state.test.ts
  fs.ts                       ← read/write ~/.agents/uni-plugin.json

src/prepare/
  delta.ts                    ← pure delta computation
  delta.test.ts
  prepare.ts                  ← application: orchestrates prepare flow
  prepare.test.ts
  fs.ts                       ← manifest reading + state I/O adapter
  cli.ts                      ← commander wiring

src/sync/
  sync.ts                     ← application: apply a single pending action
  sync.test.ts
  cli.ts                      ← commander wiring

src/self-update/
  self-update.ts              ← application: rewrite version pins in hook files
  self-update.test.ts
  fs.ts                       ← glob + read/write hook files
  cli.ts                      ← commander wiring
```

**Modified files:**

```
src/cli.ts                    ← add prepareCommand, syncCommand, selfUpdateCommand
```

---

### Task 1: Vendor registry domain

**Files:**
- Create: `src/vendor-registry/vendor-registry.ts`
- Create: `src/vendor-registry/vendor-registry.test.ts`
- Create: `src/vendor-registry/data/vendors.json`

- [ ] **Step 1: Write the failing test**

```typescript
// src/vendor-registry/vendor-registry.test.ts
import { describe, expect, it } from 'vitest'
import type { VendorConfig, VendorRegistry } from './vendor-registry.js'
import { lookupVendor, mergeRegistries } from './vendor-registry.js'

const claudeCode: VendorConfig = {
  sessionStartEvent: 'SessionStart',
  globalManifest: '~/.claude/plugins/installed_plugins.json',
  projectManifest: null,
  hookGlob: '~/.claude/plugins/universal-plugin/hooks/hooks.json',
  globalPluginDir: '~/.claude/plugins/',
  installCommand: 'claude plugin install {name}',
  removeCommand: 'claude plugin remove {name}',
  updateCommand: 'claude plugin update {name}@{version}',
}

const base: VendorRegistry = { 'claude-code': claudeCode }

describe('lookupVendor', () => {
  it('returns config for known vendor', () => {
    expect(lookupVendor(base, 'claude-code')).toEqual(claudeCode)
  })

  it('returns null for unknown vendor', () => {
    expect(lookupVendor(base, 'unknown')).toBeNull()
  })
})

describe('mergeRegistries', () => {
  it('user override replaces fields in base', () => {
    const override: VendorRegistry = {
      'claude-code': { ...claudeCode, installCommand: 'my-custom-install {name}' },
    }
    const merged = mergeRegistries(base, override)
    expect(merged['claude-code']!.installCommand).toBe('my-custom-install {name}')
  })

  it('user override can add a new vendor', () => {
    const override: VendorRegistry = {
      'my-vendor': { ...claudeCode, sessionStartEvent: 'customStart' },
    }
    const merged = mergeRegistries(base, override)
    expect(merged['my-vendor']).toBeDefined()
    expect(merged['claude-code']).toBeDefined()
  })

  it('base is unchanged when override is empty', () => {
    expect(mergeRegistries(base, {})).toEqual(base)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm build && vitest run src/vendor-registry/vendor-registry.test.ts
```

Expected: FAIL — cannot find module `./vendor-registry.js`

- [ ] **Step 3: Create `vendors.json`**

```json
// src/vendor-registry/data/vendors.json
{
  "claude-code": {
    "sessionStartEvent": "SessionStart",
    "globalManifest": "~/.claude/plugins/installed_plugins.json",
    "projectManifest": null,
    "hookGlob": "~/.claude/plugins/universal-plugin/hooks/hooks.json",
    "globalPluginDir": "~/.claude/plugins/",
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
    "installCommand": null,
    "removeCommand": null,
    "updateCommand": null
  }
}
```

- [ ] **Step 4: Write `vendor-registry.ts`**

```typescript
// src/vendor-registry/vendor-registry.ts
export interface VendorConfig {
  sessionStartEvent: string
  globalManifest: string | null
  projectManifest: string | null
  hookGlob: string | null
  globalPluginDir: string | null
  installCommand: string | null
  removeCommand: string | null
  updateCommand: string | null
}

export type VendorRegistry = Record<string, VendorConfig>

export function lookupVendor(registry: VendorRegistry, vendorId: string): VendorConfig | null {
  return registry[vendorId] ?? null
}

export function mergeRegistries(base: VendorRegistry, override: VendorRegistry): VendorRegistry {
  const result: VendorRegistry = { ...base }
  for (const [id, config] of Object.entries(override)) {
    result[id] = { ...(base[id] ?? {}), ...config } as VendorConfig
  }
  return result
}
```

- [ ] **Step 5: Run test to verify it passes**

```
pnpm build && vitest run src/vendor-registry/vendor-registry.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/vendor-registry/
git diff --cached
git commit -m "feat(vendor-registry): add vendor registry domain with lookup and merge"
```

---

### Task 2: State file domain

**Files:**
- Create: `src/state/state.ts`
- Create: `src/state/state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/state/state.test.ts
import { describe, expect, it } from 'vitest'
import {
  addPendingAction,
  emptyState,
  isDismissed,
  mergeSafeState,
  takeSnapshot,
} from './state.js'
import type { PendingAction, StateFile } from './state.js'

describe('emptyState', () => {
  it('returns a valid empty state with schemaVersion 1', () => {
    const s = emptyState()
    expect(s.schemaVersion).toBe(1)
    expect(s.pendingActions).toEqual([])
    expect(s.dismissed).toEqual({})
    expect(s.snapshots).toEqual({})
    expect(s.uniPluginUpdates).toEqual({})
  })
})

describe('mergeSafeState', () => {
  it('preserves unknown top-level fields from stored state', () => {
    const stored = {
      schemaVersion: 1,
      unknownFuture: 'data',
      pendingActions: [],
      dismissed: {},
      snapshots: {},
      uniPluginUpdates: {},
    }
    const merged = mergeSafeState(stored as StateFile)
    expect((merged as unknown as Record<string, unknown>)['unknownFuture']).toBe('data')
  })

  it('skips pendingActions with unknown type without throwing', () => {
    const stored: StateFile = {
      ...emptyState(),
      pendingActions: [
        {
          id: '1',
          type: 'future-type' as never,
          plugin: 'p',
          version: '1.0.0',
          fromVendor: 'a',
          toVendor: 'b',
          scope: 'global',
          detectedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: '2',
          type: 'install',
          plugin: 'q',
          version: '1.0.0',
          fromVendor: 'a',
          toVendor: 'b',
          scope: 'global',
          detectedAt: '2026-01-01T00:00:00Z',
        },
      ],
    }
    const merged = mergeSafeState(stored)
    expect(merged.pendingActions).toHaveLength(1)
    expect(merged.pendingActions[0]!.id).toBe('2')
  })
})

describe('takeSnapshot', () => {
  it('upserts vendor+scope snapshot with current plugins and timestamp', () => {
    const state = emptyState()
    const plugins = { 'cyber-github': '1.2.0' }
    const now = '2026-06-07T10:00:00Z'
    const updated = takeSnapshot(state, 'claude-code', 'global', plugins, now)
    expect(updated.snapshots['claude-code']!['global']!.plugins).toEqual(plugins)
    expect(updated.snapshots['claude-code']!['global']!.takenAt).toBe(now)
  })

  it('preserves other vendors when updating one', () => {
    let state = takeSnapshot(emptyState(), 'cursor', 'global', { p: '1.0.0' }, '2026-06-06T00:00:00Z')
    state = takeSnapshot(state, 'claude-code', 'global', {}, '2026-06-07T00:00:00Z')
    expect(state.snapshots['cursor']).toBeDefined()
    expect(state.snapshots['claude-code']).toBeDefined()
  })
})

describe('isDismissed', () => {
  it('returns true for version-skipped when version matches', () => {
    const state: StateFile = {
      ...emptyState(),
      dismissed: {
        'cursor/global/cyber-github': {
          reason: 'version-skipped',
          version: '1.2.0',
          dismissedAt: '2026-01-01T00:00:00Z',
        },
      },
    }
    expect(isDismissed(state, 'cursor', 'global', 'cyber-github', '1.2.0')).toBe(true)
  })

  it('returns false for version-skipped when version differs (newer offer)', () => {
    const state: StateFile = {
      ...emptyState(),
      dismissed: {
        'cursor/global/cyber-github': {
          reason: 'version-skipped',
          version: '1.2.0',
          dismissedAt: '2026-01-01T00:00:00Z',
        },
      },
    }
    expect(isDismissed(state, 'cursor', 'global', 'cyber-github', '1.3.0')).toBe(false)
  })

  it('returns true for keep regardless of version', () => {
    const state: StateFile = {
      ...emptyState(),
      dismissed: {
        'cursor/global/cyber-github': {
          reason: 'keep',
          version: null,
          dismissedAt: '2026-01-01T00:00:00Z',
        },
      },
    }
    expect(isDismissed(state, 'cursor', 'global', 'cyber-github', '9.9.9')).toBe(true)
  })

  it('returns false for unknown key', () => {
    expect(isDismissed(emptyState(), 'cursor', 'global', 'cyber-github', '1.0.0')).toBe(false)
  })
})

describe('addPendingAction', () => {
  const action: PendingAction = {
    id: 'abc',
    type: 'install',
    plugin: 'p',
    version: '1.0.0',
    fromVendor: 'claude-code',
    toVendor: 'cursor',
    scope: 'global',
    detectedAt: '2026-01-01T00:00:00Z',
  }

  it('appends action to pendingActions', () => {
    const updated = addPendingAction(emptyState(), action)
    expect(updated.pendingActions).toHaveLength(1)
    expect(updated.pendingActions[0]).toEqual(action)
  })

  it('deduplicates by type+plugin+toVendor+scope', () => {
    const state: StateFile = { ...emptyState(), pendingActions: [action] }
    const dup: PendingAction = { ...action, id: 'xyz' }
    const updated = addPendingAction(state, dup)
    expect(updated.pendingActions).toHaveLength(1)
  })

  it('allows same plugin in different vendors', () => {
    const state: StateFile = { ...emptyState(), pendingActions: [action] }
    const other: PendingAction = { ...action, id: 'def', toVendor: 'codex' }
    const updated = addPendingAction(state, other)
    expect(updated.pendingActions).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm build && vitest run src/state/state.test.ts
```

Expected: FAIL — cannot find module `./state.js`

- [ ] **Step 3: Write `state.ts`**

```typescript
// src/state/state.ts
export type ActionType = 'install' | 'upgrade' | 'remove'
export type DismissalReason = 'version-skipped' | 'keep'

export interface PendingAction {
  id: string
  type: ActionType
  plugin: string
  version: string
  fromVendor: string
  toVendor: string
  scope: string
  detectedAt: string
}

export interface DismissedEntry {
  reason: DismissalReason
  version: string | null
  dismissedAt: string
}

export interface ScopeSnapshot {
  takenAt: string
  plugins: Record<string, string>
}

export interface UniPluginUpdateEntry {
  current: string
  available: string
  detectedAt: string
}

export interface StateFile {
  schemaVersion: 1
  snapshots: Record<string, Record<string, ScopeSnapshot>>
  dismissed: Record<string, DismissedEntry>
  pendingActions: PendingAction[]
  uniPluginUpdates: Record<string, UniPluginUpdateEntry>
}

const KNOWN_ACTION_TYPES = new Set<string>(['install', 'upgrade', 'remove'])

export function emptyState(): StateFile {
  return {
    schemaVersion: 1,
    snapshots: {},
    dismissed: {},
    pendingActions: [],
    uniPluginUpdates: {},
  }
}

export function mergeSafeState(raw: StateFile): StateFile {
  return {
    ...raw,
    pendingActions: (raw.pendingActions ?? []).filter((a) => KNOWN_ACTION_TYPES.has(a.type)),
  }
}

export function takeSnapshot(
  state: StateFile,
  vendorId: string,
  scope: string,
  plugins: Record<string, string>,
  takenAt: string,
): StateFile {
  return {
    ...state,
    snapshots: {
      ...state.snapshots,
      [vendorId]: {
        ...(state.snapshots[vendorId] ?? {}),
        [scope]: { takenAt, plugins },
      },
    },
  }
}

export function isDismissed(
  state: StateFile,
  vendorId: string,
  scope: string,
  plugin: string,
  version: string,
): boolean {
  const entry = state.dismissed[`${vendorId}/${scope}/${plugin}`]
  if (!entry) return false
  if (entry.reason === 'keep') return true
  return entry.version === version
}

export function addPendingAction(state: StateFile, action: PendingAction): StateFile {
  const key = `${action.type}|${action.plugin}|${action.toVendor}|${action.scope}`
  const exists = state.pendingActions.some(
    (a) => `${a.type}|${a.plugin}|${a.toVendor}|${a.scope}` === key,
  )
  if (exists) return state
  return { ...state, pendingActions: [...state.pendingActions, action] }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm build && vitest run src/state/state.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/
git diff --cached
git commit -m "feat(state): add state file schema, tolerant reader, and mutation helpers"
```

---

### Task 3: Delta detection

**Files:**
- Create: `src/prepare/delta.ts`
- Create: `src/prepare/delta.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/prepare/delta.test.ts
import { describe, expect, it } from 'vitest'
import { emptyState, takeSnapshot } from '../state/state.js'
import { computeDelta } from './delta.js'

describe('computeDelta', () => {
  describe('Given no previous snapshot for this vendor+scope', () => {
    it('When first run, Then no actions (bootstrap — take snapshot, no diff)', () => {
      const actions = computeDelta({
        vendorId: 'claude-code',
        scope: 'global',
        currentPlugins: { 'cyber-github': '1.0.0' },
        state: emptyState(),
        now: '2026-06-07T10:00:00Z',
      })
      expect(actions).toHaveLength(0)
    })
  })

  describe('Given plugin added to current vendor', () => {
    it('When other vendor has no snapshot yet, Then no action (other vendor unknown)', () => {
      const state = takeSnapshot(emptyState(), 'claude-code', 'global', {}, '2026-06-06T00:00:00Z')
      const actions = computeDelta({
        vendorId: 'claude-code',
        scope: 'global',
        currentPlugins: { 'cyber-github': '1.0.0' },
        state,
        now: '2026-06-07T10:00:00Z',
      })
      expect(actions).toHaveLength(0)
    })

    it('When other vendor has snapshot without the plugin, Then generates install action', () => {
      let state = takeSnapshot(emptyState(), 'claude-code', 'global', {}, '2026-06-06T00:00:00Z')
      state = takeSnapshot(state, 'cursor', 'global', {}, '2026-06-06T00:00:00Z')
      const actions = computeDelta({
        vendorId: 'claude-code',
        scope: 'global',
        currentPlugins: { 'cyber-github': '1.0.0' },
        state,
        now: '2026-06-07T10:00:00Z',
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]!.type).toBe('install')
      expect(actions[0]!.plugin).toBe('cyber-github')
      expect(actions[0]!.toVendor).toBe('cursor')
      expect(actions[0]!.fromVendor).toBe('claude-code')
    })
  })

  describe('Given plugin removed from current vendor', () => {
    it('When other vendor still has it, Then generates remove action', () => {
      let state = takeSnapshot(emptyState(), 'claude-code', 'global', { 'cyber-github': '1.0.0' }, '2026-06-06T00:00:00Z')
      state = takeSnapshot(state, 'cursor', 'global', { 'cyber-github': '1.0.0' }, '2026-06-06T00:00:00Z')
      const actions = computeDelta({
        vendorId: 'claude-code',
        scope: 'global',
        currentPlugins: {},
        state,
        now: '2026-06-07T10:00:00Z',
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]!.type).toBe('remove')
      expect(actions[0]!.toVendor).toBe('cursor')
    })
  })

  describe('Given version skew across vendors', () => {
    it('When cursor has older version, Then generates upgrade action toward cursor', () => {
      let state = takeSnapshot(emptyState(), 'claude-code', 'global', { 'cyber-github': '1.2.0' }, '2026-06-06T00:00:00Z')
      state = takeSnapshot(state, 'cursor', 'global', { 'cyber-github': '1.0.0' }, '2026-06-06T00:00:00Z')
      const actions = computeDelta({
        vendorId: 'claude-code',
        scope: 'global',
        currentPlugins: { 'cyber-github': '1.2.0' },
        state,
        now: '2026-06-07T10:00:00Z',
      })
      const upgrade = actions.find((a) => a.type === 'upgrade')
      expect(upgrade).toBeDefined()
      expect(upgrade!.toVendor).toBe('cursor')
      expect(upgrade!.version).toBe('1.2.0')
    })

    it('When current vendor has older version, Then no upgrade action (other vendor is newer)', () => {
      let state = takeSnapshot(emptyState(), 'claude-code', 'global', { 'cyber-github': '1.0.0' }, '2026-06-06T00:00:00Z')
      state = takeSnapshot(state, 'cursor', 'global', { 'cyber-github': '1.2.0' }, '2026-06-06T00:00:00Z')
      const actions = computeDelta({
        vendorId: 'claude-code',
        scope: 'global',
        currentPlugins: { 'cyber-github': '1.0.0' },
        state,
        now: '2026-06-07T10:00:00Z',
      })
      expect(actions.filter((a) => a.type === 'upgrade')).toHaveLength(0)
    })
  })

  describe('Given action is dismissed', () => {
    it('When install is dismissed for this version, Then no action generated', () => {
      let state = takeSnapshot(emptyState(), 'claude-code', 'global', {}, '2026-06-06T00:00:00Z')
      state = takeSnapshot(state, 'cursor', 'global', {}, '2026-06-06T00:00:00Z')
      state = {
        ...state,
        dismissed: {
          'cursor/global/cyber-github': {
            reason: 'version-skipped',
            version: '1.0.0',
            dismissedAt: '2026-06-01T00:00:00Z',
          },
        },
      }
      const actions = computeDelta({
        vendorId: 'claude-code',
        scope: 'global',
        currentPlugins: { 'cyber-github': '1.0.0' },
        state,
        now: '2026-06-07T10:00:00Z',
      })
      expect(actions).toHaveLength(0)
    })

    it('When install dismissed for old version but newer version is present, Then action is generated', () => {
      let state = takeSnapshot(emptyState(), 'claude-code', 'global', {}, '2026-06-06T00:00:00Z')
      state = takeSnapshot(state, 'cursor', 'global', {}, '2026-06-06T00:00:00Z')
      state = {
        ...state,
        dismissed: {
          'cursor/global/cyber-github': {
            reason: 'version-skipped',
            version: '1.0.0',
            dismissedAt: '2026-06-01T00:00:00Z',
          },
        },
      }
      const actions = computeDelta({
        vendorId: 'claude-code',
        scope: 'global',
        currentPlugins: { 'cyber-github': '1.1.0' },
        state,
        now: '2026-06-07T10:00:00Z',
      })
      expect(actions).toHaveLength(1)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm build && vitest run src/prepare/delta.test.ts
```

Expected: FAIL — cannot find module `./delta.js`

- [ ] **Step 3: Write `delta.ts`**

```typescript
// src/prepare/delta.ts
import { isDismissed } from '../state/state.js'
import type { PendingAction, StateFile } from '../state/state.js'

export interface DeltaInput {
  vendorId: string
  scope: string
  currentPlugins: Record<string, string>
  state: StateFile
  now: string
}

export function computeDelta(input: DeltaInput): PendingAction[] {
  const { vendorId, scope, currentPlugins, state, now } = input
  const previous = state.snapshots[vendorId]?.[scope]
  if (!previous) return []

  const previousPlugins = previous.plugins
  const added = Object.keys(currentPlugins).filter((p) => !(p in previousPlugins))
  const removed = Object.keys(previousPlugins).filter((p) => !(p in currentPlugins))

  const otherVendors = Object.entries(state.snapshots).filter(([id]) => id !== vendorId)
  const actions: PendingAction[] = []
  let counter = 0
  const makeId = () => `delta-${now}-${++counter}`

  for (const plugin of added) {
    const version = currentPlugins[plugin]!
    for (const [otherId, otherScopes] of otherVendors) {
      const otherScope = otherScopes[scope]
      if (!otherScope) continue
      if (plugin in otherScope.plugins) continue
      if (isDismissed(state, otherId, scope, plugin, version)) continue
      actions.push({ id: makeId(), type: 'install', plugin, version, fromVendor: vendorId, toVendor: otherId, scope, detectedAt: now })
    }
  }

  for (const plugin of removed) {
    for (const [otherId, otherScopes] of otherVendors) {
      const otherScope = otherScopes[scope]
      if (!otherScope) continue
      if (!(plugin in otherScope.plugins)) continue
      const otherVersion = otherScope.plugins[plugin]!
      if (isDismissed(state, otherId, scope, plugin, otherVersion)) continue
      actions.push({ id: makeId(), type: 'remove', plugin, version: otherVersion, fromVendor: vendorId, toVendor: otherId, scope, detectedAt: now })
    }
  }

  for (const [otherId, otherScopes] of otherVendors) {
    const otherScope = otherScopes[scope]
    if (!otherScope) continue
    for (const [plugin, version] of Object.entries(currentPlugins)) {
      const otherVersion = otherScope.plugins[plugin]
      if (!otherVersion || otherVersion === version) continue
      if (!isNewerSemver(version, otherVersion)) continue
      if (isDismissed(state, otherId, scope, plugin, version)) continue
      actions.push({ id: makeId(), type: 'upgrade', plugin, version, fromVendor: vendorId, toVendor: otherId, scope, detectedAt: now })
    }
  }

  return actions
}

function isNewerSemver(a: string, b: string): boolean {
  const [aMajor = 0, aMinor = 0, aPatch = 0] = a.split('.').map(Number)
  const [bMajor = 0, bMinor = 0, bPatch = 0] = b.split('.').map(Number)
  if (aMajor !== bMajor) return aMajor > bMajor
  if (aMinor !== bMinor) return aMinor > bMinor
  return aPatch > bPatch
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm build && vitest run src/prepare/delta.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/prepare/delta.ts src/prepare/delta.test.ts
git diff --cached
git commit -m "feat(prepare): add pure delta detection for cross-vendor sync actions"
```

---

### Task 4: Vendor registry filesystem adapter

**Files:**
- Create: `src/vendor-registry/fs.ts`

This is needed by the prepare CLI before wiring. It loads the bundled `vendors.json` and merges any user override.

- [ ] **Step 1: Write `vendor-registry/fs.ts`**

```typescript
// src/vendor-registry/fs.ts
import * as fsNode from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { VendorRegistry } from './vendor-registry.js'
import { mergeRegistries } from './vendor-registry.js'

function bundledRegistryPath(): string {
  const thisFile = fileURLToPath(import.meta.url)
  return path.join(path.dirname(thisFile), 'data', 'vendors.json')
}

function userOverridePath(): string {
  return path.join(os.homedir(), '.agents', 'uni-plugin-vendors.json')
}

export function loadRegistry(): VendorRegistry {
  const bundled = JSON.parse(fsNode.readFileSync(bundledRegistryPath(), 'utf8')) as VendorRegistry
  try {
    const override = JSON.parse(fsNode.readFileSync(userOverridePath(), 'utf8')) as VendorRegistry
    return mergeRegistries(bundled, override)
  } catch {
    return bundled
  }
}
```

- [ ] **Step 2: Build to verify no type errors**

```
pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/vendor-registry/fs.ts
git diff --cached
git commit -m "feat(vendor-registry): add filesystem adapter for loading bundled and user-override registry"
```

---

### Task 5: `prepare` command

**Files:**
- Create: `src/prepare/prepare.ts`
- Create: `src/prepare/prepare.test.ts`
- Create: `src/prepare/fs.ts`
- Create: `src/prepare/cli.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/prepare/prepare.test.ts
import { describe, expect, it } from 'vitest'
import { emptyState, takeSnapshot } from '../state/state.js'
import type { StateFile } from '../state/state.js'
import type { PrepareFs } from './fs.js'
import { runPrepare } from './prepare.js'

function makeFs(opts: {
  manifestPlugins?: Record<string, string>
  globalState?: StateFile
  projectState?: StateFile | null
}): PrepareFs & { written: { global?: StateFile; project?: StateFile } } {
  const written: { global?: StateFile; project?: StateFile } = {}
  return {
    readManifest: () => opts.manifestPlugins ?? {},
    readGlobalState: () => opts.globalState ?? emptyState(),
    readProjectState: () => opts.projectState ?? null,
    writeGlobalState: (s) => { written.global = s },
    writeProjectState: (s) => { written.project = s },
    written,
  }
}

describe('runPrepare', () => {
  describe('Given first run (no previous snapshot)', () => {
    it('When prepare runs, Then takes snapshot and reports zero new actions', () => {
      const fs = makeFs({ manifestPlugins: { 'cyber-github': '1.0.0' } })
      const result = runPrepare({
        vendorId: 'claude-code',
        scope: 'global',
        fs,
        now: '2026-06-07T10:00:00Z',
      })
      expect(result.newActionCount).toBe(0)
      expect(fs.written.global).toBeDefined()
      expect(fs.written.global!.snapshots['claude-code']!['global']!.plugins).toEqual({
        'cyber-github': '1.0.0',
      })
    })
  })

  describe('Given plugin added since last snapshot, another vendor is known', () => {
    it('When prepare runs, Then generates install action and reports count = 1', () => {
      let state = takeSnapshot(emptyState(), 'claude-code', 'global', {}, '2026-06-06T00:00:00Z')
      state = takeSnapshot(state, 'cursor', 'global', {}, '2026-06-06T00:00:00Z')
      const fs = makeFs({ manifestPlugins: { 'cyber-github': '1.0.0' }, globalState: state })
      const result = runPrepare({
        vendorId: 'claude-code',
        scope: 'global',
        fs,
        now: '2026-06-07T10:00:00Z',
      })
      expect(result.newActionCount).toBe(1)
      expect(fs.written.global!.pendingActions).toHaveLength(1)
    })
  })

  describe('Given dry-run mode', () => {
    it('When prepare runs with dryRun=true, Then no state is written', () => {
      const fs = makeFs({ manifestPlugins: { 'cyber-github': '1.0.0' } })
      runPrepare({
        vendorId: 'claude-code',
        scope: 'global',
        fs,
        now: '2026-06-07T10:00:00Z',
        dryRun: true,
      })
      expect(fs.written.global).toBeUndefined()
    })
  })

  describe('Given project scope', () => {
    it('When prepare runs with scope=project and no existing project state, Then creates project state', () => {
      const fs = makeFs({ manifestPlugins: { 'cyber-github': '1.0.0' }, projectState: null })
      runPrepare({
        vendorId: 'claude-code',
        scope: 'project',
        fs,
        now: '2026-06-07T10:00:00Z',
      })
      expect(fs.written.project).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm build && vitest run src/prepare/prepare.test.ts
```

- [ ] **Step 3: Write `fs.ts`** (interface + real adapter)

```typescript
// src/prepare/fs.ts
import * as fsNode from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { emptyState, mergeSafeState } from '../state/state.js'
import type { StateFile } from '../state/state.js'
import type { VendorConfig } from '../vendor-registry/vendor-registry.js'

export interface PrepareFs {
  readManifest(): Record<string, string>
  readGlobalState(): StateFile
  readProjectState(): StateFile | null
  writeGlobalState(state: StateFile): void
  writeProjectState(state: StateFile): void
}

function globalStatePath(): string {
  return path.join(os.homedir(), '.agents', 'uni-plugin.json')
}

function projectStatePath(root: string): string {
  return path.join(root, '.agents', 'uni-plugin.json')
}

function readStateFile(filePath: string): StateFile | null {
  try {
    return mergeSafeState(JSON.parse(fsNode.readFileSync(filePath, 'utf8')) as StateFile)
  } catch {
    return null
  }
}

function writeStateFile(filePath: string, state: StateFile): void {
  fsNode.mkdirSync(path.dirname(filePath), { recursive: true })
  fsNode.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

export function realPrepareFs(vendor: VendorConfig, projectRoot?: string): PrepareFs {
  return {
    readManifest(): Record<string, string> {
      if (!vendor.globalManifest) return {}
      const manifestPath = vendor.globalManifest.replace('~', os.homedir())
      try {
        const raw = JSON.parse(fsNode.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
        // Claude Code installed_plugins.json: keys are plugin names, values are objects with a version field
        return Object.fromEntries(
          Object.entries(raw).map(([k, v]) => [
            k,
            typeof v === 'object' && v !== null && 'version' in v
              ? String((v as Record<string, unknown>).version)
              : String(v),
          ]),
        )
      } catch {
        return {}
      }
    },
    readGlobalState: () => readStateFile(globalStatePath()) ?? emptyState(),
    readProjectState: () =>
      projectRoot ? readStateFile(projectStatePath(projectRoot)) : null,
    writeGlobalState: (s) => writeStateFile(globalStatePath(), s),
    writeProjectState: (s) => {
      if (projectRoot) writeStateFile(projectStatePath(projectRoot), s)
    },
  }
}
```

- [ ] **Step 4: Write `prepare.ts`**

```typescript
// src/prepare/prepare.ts
import { addPendingAction, emptyState, takeSnapshot } from '../state/state.js'
import type { StateFile } from '../state/state.js'
import { computeDelta } from './delta.js'
import type { PrepareFs } from './fs.js'

export interface PrepareOptions {
  vendorId: string
  scope: 'global' | 'project'
  fs: PrepareFs
  now: string
  dryRun?: boolean
}

export interface PrepareResult {
  newActionCount: number
}

export function runPrepare(opts: PrepareOptions): PrepareResult {
  const { vendorId, scope, fs: prepareFs, now, dryRun } = opts

  const currentPlugins = prepareFs.readManifest()
  const state =
    scope === 'global'
      ? prepareFs.readGlobalState()
      : (prepareFs.readProjectState() ?? emptyState())

  const actions = computeDelta({ vendorId, scope, currentPlugins, state, now })

  let updatedState: StateFile = takeSnapshot(state, vendorId, scope, currentPlugins, now)
  for (const action of actions) {
    updatedState = addPendingAction(updatedState, action)
  }

  if (!dryRun) {
    if (scope === 'global') prepareFs.writeGlobalState(updatedState)
    else prepareFs.writeProjectState(updatedState)
  }

  return { newActionCount: actions.length }
}
```

- [ ] **Step 5: Write `cli.ts`**

```typescript
// src/prepare/cli.ts
import { Command } from 'commander'
import { loadRegistry } from '../vendor-registry/fs.js'
import { lookupVendor } from '../vendor-registry/vendor-registry.js'
import { realPrepareFs } from './fs.js'
import { runPrepare } from './prepare.js'

export function prepareCommand(): Command {
  return new Command('prepare')
    .description('Detect cross-vendor plugin sync actions')
    .argument('<vendor-id>', 'Vendor to read manifest from (e.g. claude-code)')
    .option('--scope <scope>', 'global or project', 'global')
    .option('--root <path>', 'Project root for project-scope state file')
    .option('--dry-run', 'Print action count without writing state')
    .action(
      (vendorId: string, opts: { scope: string; root?: string; dryRun?: boolean }) => {
        const registry = loadRegistry()
        const vendor = lookupVendor(registry, vendorId)
        if (!vendor) {
          process.stderr.write(`Unknown vendor: ${vendorId}\n`)
          process.exit(1)
        }
        const now = new Date().toISOString()
        const prepareFs = realPrepareFs(vendor, opts.root)
        const { newActionCount } = runPrepare({
          vendorId,
          scope: opts.scope as 'global' | 'project',
          fs: prepareFs,
          now,
          dryRun: opts.dryRun,
        })
        if (newActionCount > 0) {
          process.stdout.write(
            `${newActionCount} plugin sync action(s) pending. Run /sync to review.\n`,
          )
        }
      },
    )
}
```

- [ ] **Step 6: Run test to verify it passes**

```
pnpm build && vitest run src/prepare/prepare.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/prepare/
git diff --cached
git commit -m "feat(prepare): add prepare command with manifest diffing and state write"
```

---

### Task 6: `sync apply` command

**Files:**
- Create: `src/sync/sync.ts`
- Create: `src/sync/sync.test.ts`
- Create: `src/sync/cli.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/sync/sync.test.ts
import { describe, expect, it } from 'vitest'
import { emptyState, takeSnapshot } from '../state/state.js'
import type { StateFile } from '../state/state.js'
import type { VendorRegistry } from '../vendor-registry/vendor-registry.js'
import type { SyncFs } from './sync.js'
import { applySyncAction } from './sync.js'

const cursorRegistry: VendorRegistry = {
  cursor: {
    sessionStartEvent: 'sessionStart',
    globalManifest: null,
    projectManifest: null,
    hookGlob: null,
    globalPluginDir: null,
    installCommand: 'cursor plugin install {name}',
    removeCommand: 'cursor plugin remove {name}',
    updateCommand: 'cursor plugin update {name}@{version}',
  },
}

const nullCommandRegistry: VendorRegistry = {
  cursor: {
    ...cursorRegistry.cursor!,
    installCommand: null,
  },
}

const baseAction = {
  id: 'abc',
  type: 'install' as const,
  plugin: 'cyber-github',
  version: '1.0.0',
  fromVendor: 'claude-code',
  toVendor: 'cursor',
  scope: 'global',
  detectedAt: '2026-06-07T00:00:00Z',
}

function makeFs(opts: {
  state?: StateFile
  shellExitCode?: number
  hasPlugin?: boolean
}): SyncFs & { shelled?: string; written?: StateFile } {
  const result: SyncFs & { shelled?: string; written?: StateFile } = {
    readGlobalState: () => opts.state ?? emptyState(),
    writeGlobalState: (s) => { result.written = s },
    hasPlugin: () => opts.hasPlugin ?? true,
    shell: (cmd) => { result.shelled = cmd; return opts.shellExitCode ?? 0 },
  }
  return result
}

describe('applySyncAction', () => {
  it('returns not-found when action id is missing from state', () => {
    const fs = makeFs({})
    const result = applySyncAction({ actionId: 'missing', registry: cursorRegistry, fs, now: '2026-06-07T10:00:00Z' })
    expect(result.outcome).toBe('not-found')
  })

  it('shells out the install command with substituted plugin name', () => {
    const state: StateFile = { ...emptyState(), pendingActions: [baseAction] }
    const fs = makeFs({ state })
    applySyncAction({ actionId: 'abc', registry: cursorRegistry, fs, now: '2026-06-07T10:00:00Z' })
    expect(fs.shelled).toBe('cursor plugin install cyber-github')
  })

  it('removes action from pendingActions on success', () => {
    const state: StateFile = { ...emptyState(), pendingActions: [baseAction] }
    const fs = makeFs({ state })
    const result = applySyncAction({ actionId: 'abc', registry: cursorRegistry, fs, now: '2026-06-07T10:00:00Z' })
    expect(result.outcome).toBe('applied')
    expect(fs.written!.pendingActions).toHaveLength(0)
  })

  it('returns failed when shell command exits non-zero', () => {
    const state: StateFile = { ...emptyState(), pendingActions: [baseAction] }
    const fs = makeFs({ state, shellExitCode: 1 })
    const result = applySyncAction({ actionId: 'abc', registry: cursorRegistry, fs, now: '2026-06-07T10:00:00Z' })
    expect(result.outcome).toBe('failed')
  })

  it('returns manual outcome and instruction when install command is null', () => {
    const state: StateFile = { ...emptyState(), pendingActions: [baseAction] }
    const fs = makeFs({ state })
    const result = applySyncAction({ actionId: 'abc', registry: nullCommandRegistry, fs, now: '2026-06-07T10:00:00Z' })
    expect(result.outcome).toBe('manual')
    expect(result.instruction).toContain('cyber-github')
    expect(result.instruction).toContain('cursor')
    expect(fs.written!.pendingActions).toHaveLength(0)
  })

  it('substitutes {version} in update command', () => {
    const upgradeAction = { ...baseAction, id: 'upg', type: 'upgrade' as const }
    const state: StateFile = { ...emptyState(), pendingActions: [upgradeAction] }
    const fs = makeFs({ state })
    applySyncAction({ actionId: 'upg', registry: cursorRegistry, fs, now: '2026-06-07T10:00:00Z' })
    expect(fs.shelled).toBe('cursor plugin update cyber-github@1.0.0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm build && vitest run src/sync/sync.test.ts
```

- [ ] **Step 3: Write `sync.ts`**

```typescript
// src/sync/sync.ts
import type { StateFile } from '../state/state.js'
import type { VendorRegistry } from '../vendor-registry/vendor-registry.js'

export interface SyncFs {
  readGlobalState(): StateFile
  writeGlobalState(state: StateFile): void
  hasPlugin(vendorId: string, plugin: string): boolean
  shell(command: string): number
}

export type SyncOutcome = 'applied' | 'failed' | 'manual' | 'not-found'

export interface SyncResult {
  outcome: SyncOutcome
  instruction?: string
}

export function applySyncAction(opts: {
  actionId: string
  registry: VendorRegistry
  fs: SyncFs
  now: string
}): SyncResult {
  const { actionId, registry, fs } = opts
  const state = fs.readGlobalState()
  const action = state.pendingActions.find((a) => a.id === actionId)
  if (!action) return { outcome: 'not-found' }

  const vendor = registry[action.toVendor]
  const templateCommand =
    action.type === 'install'
      ? vendor?.installCommand
      : action.type === 'remove'
        ? vendor?.removeCommand
        : vendor?.updateCommand

  const withoutAction = {
    ...state,
    pendingActions: state.pendingActions.filter((a) => a.id !== actionId),
  }

  if (!templateCommand) {
    fs.writeGlobalState(withoutAction)
    return {
      outcome: 'manual',
      instruction: `Install ${action.plugin}@${action.version} in ${action.toVendor} via its marketplace, then run /sync again.`,
    }
  }

  const command = templateCommand
    .replace('{name}', action.plugin)
    .replace('{version}', action.version)
  const exitCode = fs.shell(command)
  if (exitCode !== 0) return { outcome: 'failed' }

  fs.writeGlobalState(withoutAction)
  return { outcome: 'applied' }
}
```

- [ ] **Step 4: Write `cli.ts`**

```typescript
// src/sync/cli.ts
import * as childProcess from 'node:child_process'
import * as fsNode from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Command } from 'commander'
import { emptyState, mergeSafeState } from '../state/state.js'
import type { StateFile } from '../state/state.js'
import { loadRegistry } from '../vendor-registry/fs.js'
import type { SyncFs } from './sync.js'
import { applySyncAction } from './sync.js'

function globalStatePath(): string {
  return path.join(os.homedir(), '.agents', 'uni-plugin.json')
}

function realSyncFs(): SyncFs {
  return {
    readGlobalState: (): StateFile => {
      try {
        return mergeSafeState(JSON.parse(fsNode.readFileSync(globalStatePath(), 'utf8')) as StateFile)
      } catch {
        return emptyState()
      }
    },
    writeGlobalState: (s: StateFile): void => {
      fsNode.mkdirSync(path.dirname(globalStatePath()), { recursive: true })
      fsNode.writeFileSync(globalStatePath(), JSON.stringify(s, null, 2) + '\n')
    },
    hasPlugin: (): boolean => true,
    shell: (cmd: string): number =>
      childProcess.spawnSync(cmd, { shell: true, stdio: 'inherit' }).status ?? 1,
  }
}

export function syncCommand(): Command {
  const cmd = new Command('sync').description('Manage cross-vendor plugin sync')

  cmd
    .command('apply')
    .description('Apply a pending sync action')
    .argument('<action-id>', 'Action ID from ~/.agents/uni-plugin.json')
    .action((actionId: string) => {
      const registry = loadRegistry()
      const result = applySyncAction({
        actionId,
        registry,
        fs: realSyncFs(),
        now: new Date().toISOString(),
      })
      if (result.outcome === 'applied') {
        process.stdout.write('Applied.\n')
      } else if (result.outcome === 'manual') {
        process.stdout.write(`${result.instruction}\n`)
      } else if (result.outcome === 'not-found') {
        process.stderr.write(`Action "${actionId}" not found in state file.\n`)
        process.exit(1)
      } else {
        process.stderr.write('Apply failed. Try again or install manually.\n')
        process.exit(1)
      }
    })

  return cmd
}
```

- [ ] **Step 5: Run test to verify it passes**

```
pnpm build && vitest run src/sync/sync.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/sync/
git diff --cached
git commit -m "feat(sync): add sync apply command for executing pending cross-vendor actions"
```

---

### Task 7: `self-update` command

**Files:**
- Create: `src/self-update/self-update.ts`
- Create: `src/self-update/self-update.test.ts`
- Create: `src/self-update/fs.ts`
- Create: `src/self-update/cli.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/self-update/self-update.test.ts
import { describe, expect, it } from 'vitest'
import { emptyState } from '../state/state.js'
import type { StateFile } from '../state/state.js'
import type { SelfUpdateFs } from './self-update.js'
import { runSelfUpdate } from './self-update.js'

function makeFs(
  files: Record<string, string>,
  state: StateFile = emptyState(),
): SelfUpdateFs & { written: Record<string, string>; savedState?: StateFile } {
  const result: SelfUpdateFs & { written: Record<string, string>; savedState?: StateFile } = {
    written: {},
    globHookFiles: () => Object.keys(files),
    readFile: (p) => files[p] ?? '',
    writeFile: (p, content) => { result.written[p] = content },
    readGlobalState: () => state,
    writeGlobalState: (s) => { result.savedState = s },
  }
  return result
}

describe('runSelfUpdate', () => {
  it('replaces same-major version pin across all hook files', () => {
    const files = {
      '/hooks/claude.json': '{"SessionStart":[{"command":"npx uni-plugin@1.2.3 prepare claude-code"}]}',
      '/hooks/cursor.json': '{"sessionStart":[{"command":"npx uni-plugin@1.2.3 prepare cursor"}]}',
    }
    const fs = makeFs(files)
    const result = runSelfUpdate({ toVersion: '1.5.0', fs })
    expect(result.updatedCount).toBe(2)
    expect(fs.written['/hooks/claude.json']).toContain('npx uni-plugin@1.5.0')
    expect(fs.written['/hooks/cursor.json']).toContain('npx uni-plugin@1.5.0')
  })

  it('does not touch pins from a different major', () => {
    const files = {
      '/hooks/claude.json': '{"SessionStart":[{"command":"npx uni-plugin@2.0.0 prepare claude-code"}]}',
    }
    const fs = makeFs(files)
    const result = runSelfUpdate({ toVersion: '1.5.0', fs })
    expect(result.updatedCount).toBe(0)
    expect(fs.written['/hooks/claude.json']).toBeUndefined()
  })

  it('does not rewrite a file that already has the target version', () => {
    const files = {
      '/hooks/claude.json': '{"SessionStart":[{"command":"npx uni-plugin@1.5.0 prepare claude-code"}]}',
    }
    const fs = makeFs(files)
    const result = runSelfUpdate({ toVersion: '1.5.0', fs })
    expect(result.updatedCount).toBe(0)
  })

  it('clears the uniPluginUpdates entry for the updated major', () => {
    const state: StateFile = {
      ...emptyState(),
      uniPluginUpdates: {
        '1': { current: '1.2.3', available: '1.5.0', detectedAt: '2026-06-07T00:00:00Z' },
        '2': { current: '2.0.0', available: '2.1.0', detectedAt: '2026-06-07T00:00:00Z' },
      },
    }
    const fs = makeFs({}, state)
    runSelfUpdate({ toVersion: '1.5.0', fs })
    expect(fs.savedState!.uniPluginUpdates['1']).toBeUndefined()
    expect(fs.savedState!.uniPluginUpdates['2']).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm build && vitest run src/self-update/self-update.test.ts
```

- [ ] **Step 3: Write `self-update.ts`**

```typescript
// src/self-update/self-update.ts
import type { StateFile } from '../state/state.js'

export interface SelfUpdateFs {
  globHookFiles(): string[]
  readFile(filePath: string): string
  writeFile(filePath: string, content: string): void
  readGlobalState(): StateFile
  writeGlobalState(state: StateFile): void
}

export interface SelfUpdateResult {
  updatedCount: number
}

export function runSelfUpdate(opts: { toVersion: string; fs: SelfUpdateFs }): SelfUpdateResult {
  const { toVersion, fs } = opts
  const [major] = toVersion.split('.')
  // Matches `npx uni-plugin@<same-major>.<any>.<any>` — does not match other majors
  const pattern = new RegExp(`(npx uni-plugin@)${major}\\.[0-9]+\\.[0-9]+`, 'g')

  let updatedCount = 0
  for (const filePath of fs.globHookFiles()) {
    const content = fs.readFile(filePath)
    pattern.lastIndex = 0
    if (!pattern.test(content)) continue
    pattern.lastIndex = 0
    const updated = content.replace(pattern, `$1${toVersion}`)
    if (updated !== content) {
      fs.writeFile(filePath, updated)
      updatedCount++
    }
  }

  const state = fs.readGlobalState()
  const updates = { ...state.uniPluginUpdates }
  delete updates[major!]
  fs.writeGlobalState({ ...state, uniPluginUpdates: updates })

  return { updatedCount }
}
```

- [ ] **Step 4: Write `fs.ts`**

```typescript
// src/self-update/fs.ts
import * as fsNode from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { emptyState, mergeSafeState } from '../state/state.js'
import type { StateFile } from '../state/state.js'
import type { SelfUpdateFs } from './self-update.js'

function globalStatePath(): string {
  return path.join(os.homedir(), '.agents', 'uni-plugin.json')
}

export function realSelfUpdateFs(hookFilePaths: string[]): SelfUpdateFs {
  return {
    globHookFiles: () => hookFilePaths,
    readFile: (p) => fsNode.readFileSync(p, 'utf8'),
    writeFile: (p, c) => fsNode.writeFileSync(p, c, 'utf8'),
    readGlobalState: (): StateFile => {
      try {
        return mergeSafeState(JSON.parse(fsNode.readFileSync(globalStatePath(), 'utf8')) as StateFile)
      } catch {
        return emptyState()
      }
    },
    writeGlobalState: (s: StateFile): void => {
      fsNode.mkdirSync(path.dirname(globalStatePath()), { recursive: true })
      fsNode.writeFileSync(globalStatePath(), JSON.stringify(s, null, 2) + '\n')
    },
  }
}
```

- [ ] **Step 5: Write `cli.ts`**

```typescript
// src/self-update/cli.ts
import * as fsNode from 'node:fs'
import * as os from 'node:os'
import { Command } from 'commander'
import { loadRegistry } from '../vendor-registry/fs.js'
import { realSelfUpdateFs } from './fs.js'
import { runSelfUpdate } from './self-update.js'

export function selfUpdateCommand(): Command {
  return new Command('self-update')
    .description('Update uni-plugin version pin in universal-plugin hook files')
    .argument('<version>', 'Target version (e.g. 1.5.0)')
    .action((toVersion: string) => {
      const registry = loadRegistry()
      const hookFilePaths = Object.values(registry)
        .map((v) => v.hookGlob)
        .filter((g): g is string => g !== null)
        .map((g) => g.replace('~', os.homedir()))
        .filter((p) => {
          try {
            fsNode.accessSync(p)
            return true
          } catch {
            return false
          }
        })
      const { updatedCount } = runSelfUpdate({
        toVersion,
        fs: realSelfUpdateFs(hookFilePaths),
      })
      process.stdout.write(`Updated ${updatedCount} hook file(s).\n`)
    })
}
```

- [ ] **Step 6: Run test to verify it passes**

```
pnpm build && vitest run src/self-update/self-update.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/self-update/
git diff --cached
git commit -m "feat(self-update): add self-update command to rewrite uni-plugin version pins in hook files"
```

---

### Task 8: Wire commands into CLI + full verification

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Update `src/cli.ts`**

```typescript
// src/cli.ts
#!/usr/bin/env node
import { Command } from 'commander'

import { buildCommand } from './build/cli.js'
import { governanceCommand } from './governance/cli.js'
import { prepareCommand } from './prepare/cli.js'
import { selfUpdateCommand } from './self-update/cli.js'
import { syncCommand } from './sync/cli.js'

const program = new Command()

program.name('uni-plugin').description('Universal AI agent plugin build tool').version('0.0.0')

program.addCommand(buildCommand())
program.addCommand(governanceCommand())
program.addCommand(prepareCommand())
program.addCommand(syncCommand())
program.addCommand(selfUpdateCommand())

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
```

- [ ] **Step 2: Build and smoke-test each new command**

```
pnpm build
node dist/cli.mjs prepare --help
node dist/cli.mjs sync --help
node dist/cli.mjs sync apply --help
node dist/cli.mjs self-update --help
```

Expected output for `prepare --help`:
```
Usage: uni-plugin prepare [options] <vendor-id>

Detect cross-vendor plugin sync actions

Arguments:
  vendor-id             Vendor to read manifest from (e.g. claude-code)

Options:
  --scope <scope>       global or project (default: "global")
  --root <path>         Project root for project-scope state file
  --dry-run             Print action count without writing state
  -h, --help            display help for command
```

- [ ] **Step 3: Run full test suite and linter**

```
pnpm verify
```

Expected: all tests pass, no lint errors, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git diff --cached
git commit -m "feat(cli): wire prepare, sync, and self-update commands into uni-plugin CLI"
```

---

## What this plan does NOT cover (follow-on plan)

- **npm update check** in `prepare` step 13 — requires an http infrastructure layer; defer until the three core commands work end-to-end.
- **`universal-plugin` plugin structure** — `.plugin/plugin.json`, hook file generation via `uni-plugin build`, `skills/sync/SKILL.md`, `skills/prepare/SKILL.md`. This is a separate subsystem with no code dependencies on the CLI.
- **Vendor manifest paths for Cursor, Codex, Copilot CLI** — blocked on `plugin-consumption-leveling` research; fill in `vendors.json` once that research is complete.
