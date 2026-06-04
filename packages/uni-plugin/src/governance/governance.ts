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
