import * as path from 'node:path'
import type { SyncVersionFs } from './fs.js'

export interface SyncVersionResult {
	version: string
	manifestPath: string
}

export function syncVersion(root: string, syncFs: SyncVersionFs): SyncVersionResult {
	const manifestPath = path.join(root, '.plugin', 'plugin.json')
	if (!syncFs.exists(manifestPath)) {
		throw new Error(`No .plugin/plugin.json found at ${root}`)
	}

	const manifest = JSON.parse(syncFs.read(manifestPath)) as Record<string, unknown>

	const packagePath = manifest['packagePath']
	if (!packagePath || typeof packagePath !== 'string') {
		throw new Error('packagePath is required in .plugin/plugin.json')
	}

	const pkgJsonPath = path.join(root, packagePath, 'package.json')
	if (!syncFs.exists(pkgJsonPath)) {
		throw new Error(`No package.json found at ${packagePath}`)
	}

	const pkg = JSON.parse(syncFs.read(pkgJsonPath)) as Record<string, unknown>
	const version = pkg['version']
	if (!version || typeof version !== 'string') {
		throw new Error(`No version found in ${packagePath}/package.json`)
	}

	const updated = { ...manifest, version }
	syncFs.write(manifestPath, `${JSON.stringify(updated, null, '\t')}\n`)

	return { version, manifestPath }
}
