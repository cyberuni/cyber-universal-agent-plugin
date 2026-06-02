import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { expect, test } from 'vitest'

const bin = path.resolve('bin/uni-plugin.mjs')

function run(...args: string[]) {
	return spawnSync('node', [bin, ...args], {
		encoding: 'utf8',
		env: { ...process.env, NODE_NO_WARNINGS: '1' },
	})
}

test('prints help when no arguments given', () => {
	const result = run()
	expect(result.stdout + result.stderr).toMatch(/uni-plugin/)
})

test('prints error for unknown command', () => {
	const result = run('unknown-command')
	expect(result.status).toBe(1)
	expect(result.stderr).toMatch(/unknown command/)
})

test('build fails when .plugin/plugin.json is missing', () => {
	const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-plugin-smoke-'))
	try {
		const result = spawnSync('node', [bin, 'build', '--root', empty], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(1)
		expect(result.stderr).toMatch(/plugin\.json/)
	} finally {
		fs.rmSync(empty, { recursive: true, force: true })
	}
})

test('build --dry-run lists vendors without writing', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-plugin-dryrun-'))
	try {
		fs.mkdirSync(path.join(root, '.plugin'))
		fs.writeFileSync(
			path.join(root, '.plugin', 'plugin.json'),
			JSON.stringify({ name: 'test-plugin', vendorExtensions: { 'claude-code': {} } }),
		)
		const result = spawnSync('node', [bin, 'build', '--dry-run', '--root', root], {
			encoding: 'utf8',
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})
		expect(result.status).toBe(0)
		expect(fs.existsSync(path.join(root, '.claude-plugin'))).toBe(false)
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
})
