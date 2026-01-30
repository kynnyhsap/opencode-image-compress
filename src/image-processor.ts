import type { Part } from '@opencode-ai/sdk'

import { compressImage } from './compression.js'
import type { Logger } from './logger.js'
import type { CompressionResult, ImageFilePart } from './types.js'
import { PROVIDER_IMAGE_LIMITS, TARGET_MULTIPLIER } from './types.js'
import {
	isImageFilePart,
	getCacheKey,
	getCachedImage,
	setCachedImage,
	parseDataUri,
	getSizeFromDataUri,
	formatBytes,
} from './utils.js'

/**
 * Get image size limit for a provider
 */
export function getProviderLimit(providerID: string): number {
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
	log?: Logger,
): Promise<CompressionResult> {
	if (!isImageFilePart(part)) {
		return { part, originalSize: 0, compressedSize: 0, wasCompressed: false, failed: false }
	}

	const imagePart = part as ImageFilePart
	const maxSize = getProviderLimit(providerID)
	const targetSize = maxSize * TARGET_MULTIPLIER

	const parsed = parseDataUri(imagePart.url)
	if (!parsed) {
		log?.warn('failed to parse data URI', { mime: imagePart.mime })
		return { part, originalSize: 0, compressedSize: 0, wasCompressed: false, failed: true }
	}

	const originalSize = parsed.data.length

	// Check cache first
	const cacheKey = getCacheKey(providerID, imagePart.url)
	const cached = getCachedImage(cacheKey)
	if (cached) {
		const compressedSize = getSizeFromDataUri(cached)
		log?.debug('cache hit', {
			provider: providerID,
			originalSize: formatBytes(originalSize),
			compressedSize: formatBytes(compressedSize),
		})
		return {
			part: { ...imagePart, url: cached },
			originalSize,
			compressedSize,
			wasCompressed: true,
			failed: false,
		}
	}

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

		setCachedImage(cacheKey, newDataUri)

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
