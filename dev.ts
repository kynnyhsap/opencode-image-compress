import type { Config } from '@opencode-ai/sdk'
import { spawn, $ } from 'bun'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const scriptDir = dirname(import.meta.path)
const args = process.argv.slice(2)
const pluginPath = pathToFileURL(scriptDir).href

// Get current config and filter out npm version of this plugin to avoid conflicts
const currentConfig = (await $`opencode debug config`.json()) as Config
const existingPlugins = (currentConfig.plugin ?? []).filter(
	(p) => typeof p === 'string' && !p.startsWith('opencode-image-compress'),
)

const config = { plugin: [...existingPlugins, pluginPath] } satisfies Config
const OPENCODE_CONFIG_CONTENT = JSON.stringify(config)

const proc = spawn(['opencode', ...args], {
	env: {
		...process.env,
		OPENCODE_CONFIG_CONTENT,
	},
	stdin: 'inherit',
	stdout: 'inherit',
	stderr: 'inherit',
})

await proc.exited
