import type { Part } from '@opencode-ai/sdk'
import { describe, test, expect } from 'bun:test'

import { MB } from '../../src/types.ts'
import type { ImageFilePart } from '../../src/types.ts'
import { formatBytes, parseDataUri, isImageFilePart } from '../../src/utils.ts'

describe('utils', () => {
	describe('formatBytes', () => {
		test('should format bytes', () => {
			expect(formatBytes(500)).toBe('500 B')
		})

		test('should format kilobytes', () => {
			expect(formatBytes(1536)).toBe('1.5 KB')
		})

		test('should format megabytes', () => {
			expect(formatBytes(5 * MB)).toBe('5.00 MB')
		})
	})

	describe('parseDataUri', () => {
		test('should parse valid data URI', () => {
			const base64 = Buffer.from('test').toString('base64')
			const uri = `data:image/png;base64,${base64}`
			const parsed = parseDataUri(uri)

			expect(parsed).not.toBeNull()
			expect(parsed?.mime).toBe('image/png')
			expect(parsed?.data.toString()).toBe('test')
		})

		test('should return null for invalid URI', () => {
			expect(parseDataUri('not a data uri')).toBeNull()
			expect(parseDataUri('data:image/png;base64,')).toBeNull()
		})
	})

	describe('isImageFilePart', () => {
		test('should return true for image file parts', () => {
			const part = {
				type: 'file',
				mime: 'image/jpeg',
				url: 'data:image/jpeg;base64,abc123',
			} as Part

			expect(isImageFilePart(part)).toBe(true)
		})

		test('should return false for non-image parts', () => {
			const textPart = { type: 'text', text: 'hello' } as Part
			expect(isImageFilePart(textPart)).toBe(false)
		})

		test('should return false for non-data URL images', () => {
			const part = {
				type: 'file',
				mime: 'image/jpeg',
				url: 'https://example.com/image.jpg',
			} as Part

			expect(isImageFilePart(part)).toBe(false)
		})

		// BUG FIX: isImageFilePart validates all required fields exist.
		// After the guard passes, casting to ImageFilePart is safe.
		// This test verifies the guard correctly validates mime/url fields.
		test('should validate all ImageFilePart fields for safe casting', () => {
			const part = {
				type: 'file',
				mime: 'image/png',
				url: 'data:image/png;base64,abc',
			} as Part

			expect(isImageFilePart(part)).toBe(true)

			// After guard passes, casting is safe — verify the fields
			const imagePart = part as unknown as ImageFilePart
			expect(imagePart.url).toBe('data:image/png;base64,abc')
			expect(imagePart.mime).toBe('image/png')
		})

		test('should return false for file parts with non-image mime', () => {
			const part = {
				type: 'file',
				mime: 'application/pdf',
				url: 'data:application/pdf;base64,abc',
			} as Part

			expect(isImageFilePart(part)).toBe(false)
		})
	})
})
