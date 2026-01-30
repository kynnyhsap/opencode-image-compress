import sharp from 'sharp'

import type { Logger } from './logger.js'
import type { CompressedImage, CompressionAdjustment } from './types.js'
import { MAX_DIMENSION, TARGET_MULTIPLIER } from './types.js'

/**
 * Compress an image to meet size requirements
 */
export async function compressImage(
	imageData: Buffer,
	mime: string,
	maxSize: number,
	log?: Logger,
): Promise<CompressedImage> {
	const targetSize = maxSize * TARGET_MULTIPLIER

	// Skip if already under target
	if (imageData.length <= targetSize) {
		return { data: imageData, mime }
	}

	const metadata = await sharp(imageData).metadata()
	const { width = 0, height = 0 } = metadata

	// Calculate initial scale based on max dimension
	const maxDim = Math.max(width, height)
	let scale = maxDim > MAX_DIMENSION ? MAX_DIMENSION / maxDim : 1
	let quality = getInitialQuality(mime)

	log?.debug('starting progressive compression', {
		width,
		height,
		initialScale: scale.toFixed(2),
		initialQuality: quality,
		mime,
	})

	// Progressive compression attempts
	for (let attempt = 0; attempt < 10; attempt++) {
		const resized = await resizeImage(imageData, width, height, scale)
		const processed = await compressWithQuality(resized, mime, quality)

		if (processed.length <= targetSize) {
			log?.debug('compression succeeded', {
				attempt: attempt + 1,
				quality,
				scale: scale.toFixed(2),
				resultSize: processed.length,
			})
			return {
				data: processed,
				mime: mime === 'image/gif' ? 'image/png' : mime,
			}
		}

		log?.debug('attempt did not meet target, adjusting', {
			attempt: attempt + 1,
			quality,
			scale: scale.toFixed(2),
			resultSize: processed.length,
			targetSize,
		})

		// Adjust quality/scale for next attempt
		const adjustment = calculateAdjustment(mime, quality, scale)
		quality = adjustment.quality
		scale = adjustment.scale
	}

	// Fallback: aggressive resize
	log?.warn('progressive compression exhausted, using aggressive fallback', {
		width,
		height,
		mime,
	})
	return aggressiveCompression(imageData, mime)
}

/**
 * Get initial quality setting based on format
 */
function getInitialQuality(mime: string): number {
	// PNG compression level is 0-9, GIF gets converted to PNG
	if (mime === 'image/png' || mime === 'image/gif') return 9
	return 90 // JPEG/WebP/AVIF quality (0-100)
}

/**
 * Resize image with sharp
 */
async function resizeImage(
	imageData: Buffer,
	width: number,
	height: number,
	scale: number,
): Promise<sharp.Sharp> {
	if (scale >= 1) {
		return sharp(imageData)
	}

	return sharp(imageData).resize(Math.round(width * scale), Math.round(height * scale), {
		fit: 'inside',
		withoutEnlargement: true,
	})
}

/**
 * Compress image with specific quality settings
 */
async function compressWithQuality(
	sharpInstance: sharp.Sharp,
	mime: string,
	quality: number,
): Promise<Buffer> {
	switch (mime) {
		case 'image/jpeg':
		case 'image/jpg':
			return sharpInstance.jpeg({ quality, progressive: true }).toBuffer()

		case 'image/png':
			return sharpInstance.png({ compressionLevel: quality, adaptiveFiltering: true }).toBuffer()

		case 'image/webp':
			return sharpInstance.webp({ quality }).toBuffer()

		case 'image/avif':
			return sharpInstance.avif({ quality }).toBuffer()

		case 'image/gif':
			// Convert GIF to PNG for better compression
			return sharpInstance.png({ compressionLevel: quality }).toBuffer()

		default:
			// Convert unknown formats to JPEG
			return sharpInstance.jpeg({ quality, progressive: true }).toBuffer()
	}
}

/**
 * Calculate quality and scale adjustments for next compression attempt.
 *
 * Strategy:
 * - PNG/GIF: max out compression level first, then shrink dimensions
 * - Other formats: reduce quality first, then shrink dimensions
 */
function calculateAdjustment(
	mime: string,
	currentQuality: number,
	currentScale: number,
): CompressionAdjustment {
	if (mime === 'image/png' || mime === 'image/gif') {
		if (currentQuality < 9) {
			return { quality: Math.min(9, currentQuality + 2), scale: currentScale }
		}
		return { quality: 9, scale: currentScale * 0.8 }
	}

	// Other formats: reduce quality first, then shrink dimensions
	const newQuality = currentQuality - 15
	if (newQuality > 30) {
		return { quality: newQuality, scale: currentScale }
	}

	// Quality bottomed out — reset quality and shrink
	return { quality: 85, scale: currentScale * 0.8 }
}

/**
 * Aggressive fallback compression — resize to 1024px and compress hard
 */
async function aggressiveCompression(imageData: Buffer, mime: string): Promise<CompressedImage> {
	const sharpInstance = sharp(imageData).resize(1024, 1024, { fit: 'inside' })

	const finalBuffer =
		mime === 'image/png'
			? await sharpInstance.png({ compressionLevel: 9 }).toBuffer()
			: await sharpInstance.jpeg({ quality: 70, progressive: true }).toBuffer()

	return {
		data: finalBuffer,
		mime: mime === 'image/png' ? 'image/png' : 'image/jpeg',
	}
}
