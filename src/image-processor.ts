import type { Part } from '@opencode-ai/sdk'

import { compressImage } from './compression.js'
import type { CompressionResult, ImageFilePart } from './types.js'
import { PROVIDER_IMAGE_LIMITS, TARGET_MULTIPLIER } from './types.js'
import {
	isImageFilePart,
	getCacheKey,
	getCachedImage,
	setCachedImage,
	parseDataUri,
	getSizeFromDataUri,
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
export async function processImagePart(part: Part, providerID: string): Promise<CompressionResult> {
	if (!isImageFilePart(part)) {
		return { part, originalSize: 0, compressedSize: 0, wasCompressed: false }
	}

	const imagePart = part as ImageFilePart
	const maxSize = getProviderLimit(providerID)
	const targetSize = maxSize * TARGET_MULTIPLIER

	const parsed = parseDataUri(imagePart.url)
	if (!parsed) {
		return { part, originalSize: 0, compressedSize: 0, wasCompressed: false }
	}

	const originalSize = parsed.data.length

	// Check cache first
	const cacheKey = getCacheKey(providerID, imagePart.url)
	const cached = getCachedImage(cacheKey)
	if (cached) {
		return {
			part: { ...imagePart, url: cached },
			originalSize,
			compressedSize: getSizeFromDataUri(cached),
			wasCompressed: true,
		}
	}

	// Skip if already under target
	if (originalSize <= targetSize) {
		return {
			part: imagePart,
			originalSize,
			compressedSize: originalSize,
			wasCompressed: false,
		}
	}

	// Compress the image
	try {
		const compressed = await compressImage(parsed.data, parsed.mime, maxSize)
		const newDataUri = `data:${compressed.mime};base64,${compressed.data.toString('base64')}`

		setCachedImage(cacheKey, newDataUri)

		return {
			part: { ...imagePart, url: newDataUri, mime: compressed.mime },
			originalSize,
			compressedSize: compressed.data.length,
			wasCompressed: true,
		}
	} catch (error) {
		console.error(`[opencode-image-compress] Failed to compress:`, error)
		return {
			part: imagePart,
			originalSize,
			compressedSize: originalSize,
			wasCompressed: false,
		}
	}
}
