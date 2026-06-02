#!/usr/bin/env node
import { Command } from 'commander'

import { buildCommand } from './build/cli.js'

const program = new Command()

program.name('uni-plugin').description('Universal AI agent plugin build tool').version('0.0.0')

program.addCommand(buildCommand())

program.parseAsync(process.argv).catch((err: unknown) => {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
	process.exit(1)
})
