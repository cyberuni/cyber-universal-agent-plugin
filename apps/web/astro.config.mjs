// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	integrations: [
		starlight({
			title: 'uni-plugin',
			description: 'Universal AI agent plugin build tool — write once, build for Claude Code, Cursor, Codex, and Copilot CLI.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/cyberuni/cyber-universal-agent-plugin' },
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
					],
				},
				{
					label: 'CLI Reference',
					items: [
						{ label: 'Overview', slug: 'cli/overview' },
						{ label: 'build', slug: 'cli/build' },
					],
				},
			],
		}),
	],
})
