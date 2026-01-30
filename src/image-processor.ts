import type { Part } from '@opencode-ai/sdk'

import { compressImage } from './compression.js'
import type { Logger } from './logger.js'
import { MODEL_PREFIX_TO_PROVIDER, PROVIDER_IMAGE_LIMITS, PROXY_PROVIDERS } from './providers.js'
import type { CompressionResult, ImageFilePart } from './types.js'
import { TARGET_MULTIPLIER } from './types.js'
import { isImageFilePart, parseDataUri, formatBytes } from './utils.js'

/**
 * Resolve upstream provider from model ID prefix.
 * E.g. "claude-sonnet-4-5" -> "anthropic", "gpt-4o" -> "openai"
 */
export function resolveProviderFromModel(modelID: string): string | undefined {
	const lower = modelID.toLowerCase()
	for (const [prefix, provider] of Object.entries(MODEL_PREFIX_TO_PROVIDER)) {
		if (lower.startsWith(prefix)) return provider
	}
	return undefined
}

/**
 * Get image size limit for a provider.
 * For proxy providers (github-copilot, opencode), resolves the upstream
 * provider from the model ID to get the correct limit.
 */
export function getProviderLimit(providerID: string, modelID?: string): number {
	if (PROXY_PROVIDERS.has(providerID) && modelID) {
		const resolved = resolveProviderFromModel(modelID)
		if (resolved && PROVIDER_IMAGE_LIMITS[resolved]) {
			return PROVIDER_IMAGE_LIMITS[resolved]
		}
	}
	return PROVIDER_IMAGE_LIMITS[providerID] || PROVIDER_IMAGE_LIMITS.default
}

/**
 * Type guard to check if message info is a UserMessage
 */
export function isUserMessage(info: { role: string }): boolean {
	return info.role === 'user'
}

/**
 * Process an image part and return compression result
 */
export async function processImagePart(
	part: Part,
	providerID: string,
	modelID?: string,
	log?: Logger,
): Promise<CompressionResult> {
	if (!isImageFilePart(part)) {
		return { part, originalSize: 0, compressedSize: 0, wasCompressed: false, failed: false }
	}

	const imagePart = part as ImageFilePart
	const maxSize = getProviderLimit(providerID, modelID)
	const targetSize = maxSize * TARGET_MULTIPLIER

	const parsed = parseDataUri(imagePart.url)
	if (!parsed) {
		log?.warn('failed to parse data URI', { mime: imagePart.mime })
		return { part, originalSize: 0, compressedSize: 0, wasCompressed: false, failed: true }
	}

	const originalSize = parsed.data.length

	// Skip if already under target
	if (originalSize <= targetSize) {
		log?.debug('image under target, skipping', {
			provider: providerID,
			size: formatBytes(originalSize),
			target: formatBytes(targetSize),
			mime: parsed.mime,
		})
		return {
			part: imagePart,
			originalSize,
			compressedSize: originalSize,
			wasCompressed: false,
			failed: false,
		}
	}

	log?.info('compressing image', {
		provider: providerID,
		originalSize: formatBytes(originalSize),
		target: formatBytes(targetSize),
		mime: parsed.mime,
	})

	// Compress the image
	try {
		const compressed = await compressImage(parsed.data, parsed.mime, maxSize, log)
		const newDataUri = `data:${compressed.mime};base64,${compressed.data.toString('base64')}`

		log?.info('image compressed', {
			provider: providerID,
			originalSize: formatBytes(originalSize),
			compressedSize: formatBytes(compressed.data.length),
			savings: `${((1 - compressed.data.length / originalSize) * 100).toFixed(0)}%`,
			outputMime: compressed.mime,
		})

		return {
			part: { ...imagePart, url: newDataUri, mime: compressed.mime },
			originalSize,
			compressedSize: compressed.data.length,
			wasCompressed: true,
			failed: false,
		}
	} catch (error) {
		log?.error('compression failed', {
			provider: providerID,
			mime: parsed.mime,
			originalSize: formatBytes(originalSize),
			error: String(error),
		})
		return {
			part: imagePart,
			originalSize,
			compressedSize: originalSize,
			wasCompressed: false,
			failed: true,
		}
	}
}
