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
  it('returns ~/.agents/.uni-plugin/plugins/', () => {
    expect(globalStorePath()).toBe(
      path.join(os.homedir(), '.agents', '.uni-plugin', 'plugins'),
    )
  })
})

describe('projectStorePath', () => {
  it('returns <root>/.agents/.uni-plugin/plugins/', () => {
    expect(projectStorePath('/my/project')).toBe(
      '/my/project/.agents/.uni-plugin/plugins',
    )
  })
})

describe('storeEntryPath', () => {
  it('joins store root with segment', () => {
    expect(storeEntryPath('/store', 'npm/uni-plugin@1.2.3')).toBe(
      '/store/npm/uni-plugin@1.2.3',
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
