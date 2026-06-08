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
    expect(getStoreSegment('npm', 'uni-plugin', '1.2.3', defaultSources)).toBe(
      'npm/uni-plugin@1.2.3',
    )
  })

  it('npm scoped: npm/@scope/name@version', () => {
    expect(getStoreSegment('npm', '@cyberuni/uni-plugin', '1.2.3', defaultSources)).toBe(
      'npm/@cyberuni/uni-plugin@1.2.3',
    )
  })

  it('github: github.com/owner/repo@version', () => {
    expect(getStoreSegment('github.com/cyberuni/uni-plugin', 'uni-plugin', '1.2.3', defaultSources)).toBe(
      'github.com/cyberuni/uni-plugin@1.2.3',
    )
  })

  it('url: url/name-sha8@version for unrecognized host', () => {
    const url = 'https://example.com/org/repo'
    const hash = sha8(url)
    expect(getStoreSegment(url, 'uni-plugin', '1.2.3', defaultSources)).toBe(
      `url/uni-plugin-${hash}@1.2.3`,
    )
  })
})
