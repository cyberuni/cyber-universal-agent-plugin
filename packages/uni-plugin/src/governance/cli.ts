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
