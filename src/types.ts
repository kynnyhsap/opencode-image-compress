/**
 * Type definitions for opencode-image-compress plugin
 */

import type { Part } from '@opencode-ai/sdk'

export const KB = 1024
export const MB = 1024 * 1024

/**
 * Target size multiplier - we aim for 70% of the limit to account for base64 overhead
 * Base64 encoding adds ~33% overhead
 */
export const TARGET_MULTIPLIER = 0.7

/**
 * Maximum dimensions for images (most models work well with this)
 */
export const MAX_DIMENSION = 2048

/**
 * Compression result with metadata
 */
export type CompressionResult = {
	part: Part
	originalSize: number
	compressedSize: number
	wasCompressed: boolean
	failed: boolean
}

/**
 * Image file part type guard result
 */
export type ImageFilePart = Part & {
	type: 'file'
	mime: string
	url: string
}

/**
 * Result from image compression containing the buffer and output mime type
 */
export type CompressedImage = {
	data: Buffer
	mime: string
}

/**
 * Quality and scale parameters for compression adjustment
 */
export type CompressionAdjustment = {
	quality: number
	scale: number
}

/**
 * Compression stats for toast notifications
 */
export type CompressionStats = {
	originalSize: number
	compressedSize: number
}

/**
 * Parsed data URI components
 */
export type ParsedDataUri = {
	mime: string
	data: Buffer
}
