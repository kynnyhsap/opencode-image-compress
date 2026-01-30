import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { exec } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * E2E tests for opencode-image-compress plugin
 *
 * These tests verify that:
 * 1. Large images (>5MB) fail without the plugin (Anthropic limit)
 * 2. Large images pass with the plugin (automatic compression)
 * 3. Multiple images are handled correctly
 * 4. Different formats are supported
 *
 * NOTE: These tests require the `opencode` binary to be available and
 * an Anthropic API key to be configured. They may take 30-60 seconds each.
 * Run with: E2E_TESTS=1 bun test tests/e2e
 */

// Skip E2E tests unless explicitly enabled
const runE2E = process.env.E2E_TESTS === '1' || process.env.CI === 'true'

describe.skipIf(!runE2E)('opencode-image-compress E2E', () => {
	const testDir = join(tmpdir(), 'opencode-image-compress-e2e-' + Date.now())
	const fixturesDir = join(testDir, 'fixtures')
	const pluginDir = '/Users/kynnyhsap/Projects/opencode-image-compress'
	const distDir = join(pluginDir, 'dist')

	let configWithoutPlugin: string
	let configWithPlugin: string

	beforeAll(async () => {
		// Create test directories
		await mkdir(testDir, { recursive: true })
		await mkdir(fixturesDir, { recursive: true })

		// Ensure dist exists
		if (!existsSync(distDir)) {
			throw new Error("Plugin dist/ directory not found. Run 'bun run build' first.")
		}

		// Create test images
		await generateTestImages()

		// Create test configs
		configWithoutPlugin = await createConfig(false)
		configWithPlugin = await createConfig(true)
	}, 60000)

	afterAll(async () => {
		// Cleanup
		try {
			await rm(testDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	}, 60000)

	/**
	 * Generate test images of various sizes
	 */
	async function generateTestImages() {
		// Small image (under 1MB) - should work with or without plugin
		const smallBuffer = await createImageBuffer(1024, 768, 'jpeg', 80)
		await writeFile(join(fixturesDir, 'small.jpg'), smallBuffer)

		// Medium image (~2MB) - should work with or without plugin
		const mediumBuffer = await createImageBuffer(2048, 1536, 'jpeg', 85)
		await writeFile(join(fixturesDir, 'medium.jpg'), mediumBuffer)

		// Large image (~8MB) - should fail without plugin, pass with plugin
		const largeBuffer = await createImageBuffer(4096, 3072, 'jpeg', 95)
		await writeFile(join(fixturesDir, 'large.jpg'), largeBuffer)

		// Very large image (~15MB) - should fail without plugin, pass with plugin
		const veryLargeBuffer = await createImageBuffer(8192, 6144, 'jpeg', 95)
		await writeFile(join(fixturesDir, 'very-large.jpg'), veryLargeBuffer)

		// Large PNG image - should fail without plugin, pass with plugin
		const largePngBuffer = await createImageBuffer(4096, 3072, 'png', 9)
		await writeFile(join(fixturesDir, 'large.png'), largePngBuffer)
	}

	/**
	 * Create an image buffer with specified dimensions and quality
	 */
	async function createImageBuffer(
		width: number,
		height: number,
		format: 'jpeg' | 'png',
		quality: number,
	): Promise<Buffer> {
		// Create a noisy image (simulates a real screenshot)
		const data = Buffer.alloc(width * height * 3)
		for (let i = 0; i < data.length; i += 3) {
			const x = (i / 3) % width
			const y = Math.floor(i / 3 / width)
			const pattern = (x * 2 + y * 3) % 256
			const noise = Math.random() * 50
			data[i] = Math.min(255, pattern + noise)
			data[i + 1] = Math.min(255, ((pattern + 100) % 256) + noise)
			data[i + 2] = Math.min(255, ((pattern + 200) % 256) + noise)
		}

		const img = sharp(data, { raw: { width, height, channels: 3 } })

		if (format === 'jpeg') {
			return img.jpeg({ quality, progressive: true }).toBuffer()
		} else {
			return img.png({ compressionLevel: quality }).toBuffer()
		}
	}

	/**
	 * Create a test config file
	 */
	async function createConfig(withPlugin: boolean): Promise<string> {
		const config = {
			$schema: 'https://opencode.ai/config.json',
			model: 'anthropic/claude-sonnet-4-5',
			plugin: withPlugin
				? [
						{
							path: pluginDir,
						},
					]
				: [],
			// Use default permissions for testing
			permission: {
				bash: { '*': 'allow' },
				edit: 'allow',
				skill: { '*': 'allow' },
			},
		}

		const configPath = join(
			testDir,
			withPlugin ? 'config-with-plugin.json' : 'config-without-plugin.json',
		)
		await writeFile(configPath, JSON.stringify(config, null, 2))
		return configPath
	}

	/**
	 * Run opencode with a specific config and image
	 */
	async function runOpencode(
		configPath: string,
		imagePath: string,
		prompt: string = 'Describe this image in one sentence.',
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		const env = { ...process.env, OPENCODE_CONFIG: configPath }
		const command = `opencode run "${prompt}" -f ${imagePath} --format json 2>&1`

		try {
			const { stdout, stderr } = await execAsync(command, {
				env,
				timeout: 120000,
			})
			return { exitCode: 0, stdout, stderr }
		} catch (error: any) {
			return {
				exitCode: error.code || 1,
				stdout: error.stdout || '',
				stderr: error.stderr || error.message || '',
			}
		}
	}

	/**
	 * Check if output contains image size limit error
	 */
	function hasImageSizeError(output: string): boolean {
		const errorPatterns = [
			/image exceeds.*MB.*maximum/i,
			/image.*too large/i,
			/5 MB maximum/i,
			/5242880 bytes/i,
		]
		return errorPatterns.some((pattern) => pattern.test(output))
	}

	describe('without plugin', () => {
		test('small image should succeed', async () => {
			const result = await runOpencode(configWithoutPlugin, join(fixturesDir, 'small.jpg'))
			expect(hasImageSizeError(result.stderr)).toBe(false)
			expect(hasImageSizeError(result.stdout)).toBe(false)
		}, 60000)

		test('medium image should succeed', async () => {
			const result = await runOpencode(configWithoutPlugin, join(fixturesDir, 'medium.jpg'))
			expect(hasImageSizeError(result.stderr)).toBe(false)
			expect(hasImageSizeError(result.stdout)).toBe(false)
		}, 60000)

		test('large image should fail with size error', async () => {
			const result = await runOpencode(configWithoutPlugin, join(fixturesDir, 'large.jpg'))
			// Should have an error about image size
			expect(
				hasImageSizeError(result.stderr) ||
					hasImageSizeError(result.stdout) ||
					result.exitCode !== 0,
			).toBe(true)
		}, 60000)

		test('very large image should fail with size error', async () => {
			const result = await runOpencode(configWithoutPlugin, join(fixturesDir, 'very-large.jpg'))
			expect(
				hasImageSizeError(result.stderr) ||
					hasImageSizeError(result.stdout) ||
					result.exitCode !== 0,
			).toBe(true)
		}, 60000)
	})

	describe('with plugin', () => {
		test('small image should succeed', async () => {
			const result = await runOpencode(configWithPlugin, join(fixturesDir, 'small.jpg'))
			expect(hasImageSizeError(result.stderr)).toBe(false)
			expect(hasImageSizeError(result.stdout)).toBe(false)
		}, 60000)

		test('medium image should succeed', async () => {
			const result = await runOpencode(configWithPlugin, join(fixturesDir, 'medium.jpg'))
			expect(hasImageSizeError(result.stderr)).toBe(false)
			expect(hasImageSizeError(result.stdout)).toBe(false)
		}, 60000)

		test('large image should succeed (gets compressed)', async () => {
			const result = await runOpencode(configWithPlugin, join(fixturesDir, 'large.jpg'))
			expect(hasImageSizeError(result.stderr)).toBe(false)
			expect(hasImageSizeError(result.stdout)).toBe(false)
			expect(result.exitCode).toBe(0)
		}, 60000)

		test('very large image should succeed (gets compressed)', async () => {
			const result = await runOpencode(configWithPlugin, join(fixturesDir, 'very-large.jpg'))
			expect(hasImageSizeError(result.stderr)).toBe(false)
			expect(hasImageSizeError(result.stdout)).toBe(false)
			expect(result.exitCode).toBe(0)
		}, 60000)

		test('large PNG image should succeed (gets compressed)', async () => {
			const result = await runOpencode(configWithPlugin, join(fixturesDir, 'large.png'))
			expect(hasImageSizeError(result.stderr)).toBe(false)
			expect(hasImageSizeError(result.stdout)).toBe(false)
			expect(result.exitCode).toBe(0)
		}, 60000)
	})

	describe('edge cases', () => {
		test('should handle non-existent image gracefully', async () => {
			const result = await runOpencode(configWithPlugin, join(fixturesDir, 'non-existent.jpg'))
			// Should fail but not due to our plugin
			expect(result.exitCode).not.toBe(0)
		}, 60000)

		test('should handle text-only prompts without images', async () => {
			const env = { ...process.env, OPENCODE_CONFIG: configWithPlugin }
			const command = `opencode run "Hello world" --format json 2>&1`

			try {
				const { stdout, stderr } = await execAsync(command, {
					env,
					timeout: 60000,
				})
				// Text-only should work fine
				expect(hasImageSizeError(stderr)).toBe(false)
				expect(hasImageSizeError(stdout)).toBe(false)
			} catch (error: any) {
				// Even if it fails, shouldn't be due to image size
				expect(hasImageSizeError(error.stderr || error.message || '')).toBe(false)
				expect(hasImageSizeError(error.stdout || '')).toBe(false)
			}
		}, 60000)
	})
})
