// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://cyberuni.github.io',
	base: '/universal-plugin',
	integrations: [
		starlight({
			title: 'universal-plugin',
			description:
				'Universal AI agent plugin build tool — write once, build for Claude Code, Cursor, Codex, and Copilot CLI.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/cyberuni/universal-plugin' }],
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
