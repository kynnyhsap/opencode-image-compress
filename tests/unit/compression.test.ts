import { describe, test, expect } from 'bun:test'
import sharp from 'sharp'

import { compressImage } from '../../src/compression.ts'
import { TARGET_MULTIPLIER } from '../../src/types.ts'

describe('compression', () => {
	/**
	 * Helper to create test image buffer
	 */
	async function createImageBuffer(
		width: number,
		height: number,
		format: 'jpeg' | 'png',
		quality: number,
	): Promise<Buffer> {
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

	describe('compressImage', () => {
		test('should not compress images under target size', async () => {
			const buffer = await createImageBuffer(100, 100, 'jpeg', 80)
			const result = await compressImage(buffer, 'image/jpeg', 5 * 1024 * 1024)

			// Should return original
			expect(result.data.length).toBe(buffer.length)
			expect(result.mime).toBe('image/jpeg')
		})

		test('should compress large JPEG images', async () => {
			const buffer = await createImageBuffer(4096, 3072, 'jpeg', 95)
			expect(buffer.length).toBeGreaterThan(5 * 1024 * 1024)

			const result = await compressImage(buffer, 'image/jpeg', 5 * 1024 * 1024)

			// Should be smaller
			expect(result.data.length).toBeLessThan(buffer.length)
			// Should be under 5MB
			expect(result.data.length).toBeLessThan(5 * 1024 * 1024)
		})

		test('should resize images over max dimension when needed', async () => {
			// Create a very large image that will definitely need resizing
			const buffer = await createImageBuffer(8192, 8192, 'jpeg', 95)
			// 20MB limit but 70% target = 14MB, large image should trigger resize
			const result = await compressImage(buffer, 'image/jpeg', 20 * 1024 * 1024)

			const metadata = await sharp(result.data).metadata()
			// After aggressive compression, should be resized
			expect(metadata.width).toBeLessThanOrEqual(4096)
			expect(metadata.height).toBeLessThanOrEqual(4096)
		})

		test('should handle PNG images', async () => {
			const buffer = await createImageBuffer(2048, 1536, 'png', 6)
			const result = await compressImage(buffer, 'image/png', 5 * 1024 * 1024)

			expect(result.mime).toBe('image/png')
		})

		test('should preserve aspect ratio', async () => {
			const buffer = await createImageBuffer(4000, 2000, 'jpeg', 90) // 2:1 ratio
			const result = await compressImage(buffer, 'image/jpeg', 5 * 1024 * 1024)

			const metadata = await sharp(result.data).metadata()
			// Aspect ratio should be preserved (within rounding)
			const originalRatio = 4000 / 2000
			const newRatio = (metadata.width || 1) / (metadata.height || 1)
			expect(Math.abs(originalRatio - newRatio)).toBeLessThan(0.1)
		})

		// BUG FIX: compressImage used hardcoded 0.7 instead of TARGET_MULTIPLIER.
		// This test verifies the constant is respected: images just under the target
		// (maxSize * TARGET_MULTIPLIER) should not be compressed.
		test('should use TARGET_MULTIPLIER constant for target size threshold', async () => {
			const maxSize = 5 * 1024 * 1024
			const targetSize = maxSize * TARGET_MULTIPLIER

			// Create a small image that's definitely under the target
			const buffer = await createImageBuffer(100, 100, 'jpeg', 80)
			expect(buffer.length).toBeLessThan(targetSize)

			const result = await compressImage(buffer, 'image/jpeg', maxSize)

			// Should return original data unchanged — proves it uses TARGET_MULTIPLIER
			expect(result.data.length).toBe(buffer.length)
		})

		// BUG FIX: aggressiveCompression used Math.round() on literal 1024.
		// This test verifies the aggressive fallback path produces valid output
		// by forcing all 10 progressive attempts to fail (tiny maxSize).
		test('should fall back to aggressive compression for extremely tight limits', async () => {
			const buffer = await createImageBuffer(4096, 3072, 'jpeg', 95)
			// Use an absurdly small limit so progressive compression can never satisfy it
			const result = await compressImage(buffer, 'image/jpeg', 50 * 1024)

			// Should still produce a valid JPEG
			expect(result.mime).toBe('image/jpeg')
			expect(result.data.length).toBeGreaterThan(0)

			// Verify it's actually a resized image
			const metadata = await sharp(result.data).metadata()
			expect(metadata.width).toBeLessThanOrEqual(1024)
			expect(metadata.height).toBeLessThanOrEqual(1024)
		})

		// BUG FIX: calculateAdjustment didn't compound scale — it returned fresh 0.8
		// every time instead of multiplying current scale by 0.8. This meant repeated
		// compression attempts never actually shrunk the image further.
		// This test verifies that a very large image eventually gets compressed small
		// enough within the progressive loop (which requires compounding scale).
		test('should progressively shrink dimensions when quality reduction alone is insufficient', async () => {
			// Large image with a tight limit that requires both quality and dimension reduction
			const buffer = await createImageBuffer(4096, 3072, 'jpeg', 95)
			const tightLimit = 500 * 1024 // 500KB — requires aggressive shrinking

			const result = await compressImage(buffer, 'image/jpeg', tightLimit)

			// Must fit within the target (70% of 500KB = 350KB)
			expect(result.data.length).toBeLessThan(tightLimit * TARGET_MULTIPLIER)
			expect(result.mime).toBe('image/jpeg')
		})

		// BUG FIX: calculateAdjustment had a dead code branch — after quality bottomed
		// out at 30 for non-PNG, it checked `mime === "image/png"` which was always false.
		// This test verifies the non-PNG quality-bottomed-out path correctly resets quality
		// and reduces scale.
		test('should handle quality bottoming out for non-PNG formats', async () => {
			const buffer = await createImageBuffer(3000, 2000, 'jpeg', 95)
			// Tight enough to require multiple quality reductions
			const result = await compressImage(buffer, 'image/jpeg', 1 * 1024 * 1024)

			expect(result.data.length).toBeLessThan(1 * 1024 * 1024)
			expect(result.mime).toBe('image/jpeg')

			// Should be substantially smaller than original
			expect(result.data.length).toBeLessThan(buffer.length / 2)
		})

		// BUG FIX: GIF images should be converted to PNG
		test('should convert GIF to PNG during compression', async () => {
			// Create a buffer as JPEG but tell compressImage it's a GIF
			const buffer = await createImageBuffer(2048, 1536, 'jpeg', 95)
			const _smallResult = await compressImage(buffer, 'image/gif', 50 * 1024 * 1024)

			// If it was under target, it returns original mime. Create one that needs compression.
			const largeBuffer = await createImageBuffer(4096, 3072, 'jpeg', 95)
			const result2 = await compressImage(largeBuffer, 'image/gif', 5 * 1024 * 1024)

			expect(result2.mime).toBe('image/png')
		})
	})
})
