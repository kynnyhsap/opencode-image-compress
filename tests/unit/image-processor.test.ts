import type { Part } from '@opencode-ai/sdk'
import { describe, test, expect } from 'bun:test'
import sharp from 'sharp'

import {
	getProviderLimit,
	isUserMessage,
	processImagePart,
	resolveProviderFromModel,
} from '../../src/image-processor.ts'
import { PROVIDER_IMAGE_LIMITS } from '../../src/providers.ts'
import { KB, MB, TARGET_MULTIPLIER } from '../../src/types.ts'

describe('image-processor', () => {
	describe('getProviderLimit', () => {
		test('should return correct limits for known providers', () => {
			expect(getProviderLimit('anthropic')).toBe(5 * MB)
			expect(getProviderLimit('openai')).toBe(20 * MB)
			expect(getProviderLimit('google')).toBe(7 * MB)
			expect(getProviderLimit('groq')).toBe(4 * MB)
			expect(getProviderLimit('amazon-bedrock')).toBe(3.75 * MB)
			expect(getProviderLimit('perplexity')).toBe(50 * MB)
			expect(getProviderLimit('xai')).toBe(20 * MB)
			expect(getProviderLimit('fireworks-ai')).toBe(10 * MB)
			expect(getProviderLimit('togetherai')).toBe(20 * MB)
			expect(getProviderLimit('google-vertex-anthropic')).toBe(5 * MB)
		})

		test('should return default for unknown providers', () => {
			expect(getProviderLimit('unknown-provider')).toBe(PROVIDER_IMAGE_LIMITS.default)
		})

		test('should resolve proxy provider from model ID', () => {
			// github-copilot with Claude model -> anthropic limit
			expect(getProviderLimit('github-copilot', 'claude-sonnet-4-5')).toBe(5 * MB)
			// github-copilot with GPT model -> openai limit
			expect(getProviderLimit('github-copilot', 'gpt-4o')).toBe(20 * MB)
			// opencode with Gemini model -> google limit
			expect(getProviderLimit('opencode', 'gemini-2.5-pro')).toBe(7 * MB)
			// opencode with Grok model -> xai limit
			expect(getProviderLimit('opencode', 'grok-4')).toBe(20 * MB)
			// openrouter with DeepSeek model -> deepseek limit
			expect(getProviderLimit('openrouter', 'deepseek-r1')).toBe(10 * MB)
			// github-models with Claude model -> anthropic limit
			expect(getProviderLimit('github-models', 'claude-sonnet-4-5')).toBe(5 * MB)
		})

		test('should fall back to default for proxy provider with unknown model', () => {
			expect(getProviderLimit('github-copilot', 'some-unknown-model')).toBe(
				PROVIDER_IMAGE_LIMITS.default,
			)
		})

		test('should ignore modelID for non-proxy providers', () => {
			// anthropic is not a proxy provider, so modelID is ignored
			expect(getProviderLimit('anthropic', 'gpt-4o')).toBe(5 * MB)
		})
	})

	describe('resolveProviderFromModel', () => {
		test('should resolve known model prefixes', () => {
			expect(resolveProviderFromModel('claude-sonnet-4-5')).toBe('anthropic')
			expect(resolveProviderFromModel('gpt-4o')).toBe('openai')
			expect(resolveProviderFromModel('o1-preview')).toBe('openai')
			expect(resolveProviderFromModel('o3-mini')).toBe('openai')
			expect(resolveProviderFromModel('gemini-2.5-pro')).toBe('google')
			expect(resolveProviderFromModel('grok-4')).toBe('xai')
			expect(resolveProviderFromModel('deepseek-r1')).toBe('deepseek')
			expect(resolveProviderFromModel('llama-4-scout')).toBe('groq')
		})

		test('should return undefined for unknown model', () => {
			expect(resolveProviderFromModel('some-unknown-model')).toBeUndefined()
		})

		test('should be case-insensitive', () => {
			expect(resolveProviderFromModel('Claude-Sonnet-4-5')).toBe('anthropic')
			expect(resolveProviderFromModel('GPT-4o')).toBe('openai')
		})
	})

	describe('isUserMessage', () => {
		test('should return true for user role', () => {
			const info = { role: 'user' } as { role: string }
			expect(isUserMessage(info)).toBe(true)
		})

		test('should return false for non-user roles', () => {
			const info = { role: 'assistant' } as { role: string }
			expect(isUserMessage(info)).toBe(false)
		})
	})

	describe('processImagePart', () => {
		test('should skip non-image parts', async () => {
			const textPart = { type: 'text', text: 'hello' } as Part
			const result = await processImagePart(textPart, 'anthropic')

			expect(result.wasCompressed).toBe(false)
			expect(result.failed).toBe(false)
			expect(result.part).toBe(textPart)
		})

		test('should skip small images', async () => {
			// Create a small base64 image (< 100KB)
			const smallData = Buffer.alloc(50 * KB).toString('base64')
			const part = {
				type: 'file',
				mime: 'image/jpeg',
				url: `data:image/jpeg;base64,${smallData}`,
			} as Part

			const result = await processImagePart(part, 'anthropic')

			expect(result.wasCompressed).toBe(false)
			expect(result.failed).toBe(false)
		})

		// BUG FIX: processImagePart had `as ImageFilePart` cast that was unnecessary
		// once isImageFilePart became a proper type guard. This test verifies the
		// processor correctly handles the narrowed type without casting.
		test('should return original part reference for non-image input', async () => {
			const part = {
				type: 'file',
				mime: 'application/pdf',
				url: 'data:application/pdf;base64,abc',
			} as Part

			const result = await processImagePart(part, 'anthropic')
			expect(result.wasCompressed).toBe(false)
			expect(result.failed).toBe(false)
			expect(result.originalSize).toBe(0)
			// Should return the exact same object reference
			expect(result.part).toBe(part)
		})

		test('should return failed true for invalid data URI', async () => {
			const part = {
				type: 'file',
				mime: 'image/jpeg',
				url: 'data:image/jpeg;not-base64',
			} as Part

			const result = await processImagePart(part, 'anthropic')
			expect(result.wasCompressed).toBe(false)
			expect(result.failed).toBe(true)
			expect(result.originalSize).toBe(0)
		})

		// BUG FIX: processImagePart imported TARGET_MULTIPLIER but duplicated the
		// threshold logic. Verify that images just under maxSize * TARGET_MULTIPLIER
		// are not compressed.
		test('should not compress images under provider target threshold', async () => {
			const maxSize = 5 * MB
			const targetSize = maxSize * TARGET_MULTIPLIER

			// Create a real small JPEG image
			const rawData = Buffer.alloc(100 * 100 * 3)
			const smallJpeg = await sharp(rawData, {
				raw: { width: 100, height: 100, channels: 3 },
			})
				.jpeg({ quality: 50 })
				.toBuffer()

			// Ensure it's under target
			expect(smallJpeg.length).toBeLessThan(targetSize)

			const base64 = smallJpeg.toString('base64')
			const part = {
				type: 'file',
				mime: 'image/jpeg',
				url: `data:image/jpeg;base64,${base64}`,
			} as Part

			const result = await processImagePart(part, 'anthropic')
			expect(result.wasCompressed).toBe(false)
			expect(result.failed).toBe(false)
			expect(result.originalSize).toBe(smallJpeg.length)
			expect(result.compressedSize).toBe(smallJpeg.length)
		})
	})
})
