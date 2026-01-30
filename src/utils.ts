import type { Part } from '@opencode-ai/sdk'

import { KB, MB } from './types.js'
import type { ParsedDataUri } from './types.js'

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
	if (bytes < KB) return `${bytes} B`
	if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`
	return `${(bytes / MB).toFixed(2)} MB`
}

/**
 * Parse data URI to extract mime type and base64 data
 */
export function parseDataUri(dataUri: string): ParsedDataUri | null {
	const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
	if (!match) return null

	return {
		mime: match[1],
		data: Buffer.from(match[2], 'base64'),
	}
}

/**
 * Check if a part is an image file part with a data URI.
 *
 * NOTE: Returns boolean because oxfmt doesn't support TypeScript type predicate
 * syntax (`part is ImageFilePart`). Use with `as ImageFilePart` after the check.
 */
export function isImageFilePart(part: Part): boolean {
	return (
		part.type === 'file' &&
		'mime' in part &&
		typeof part.mime === 'string' &&
		part.mime.startsWith('image/') &&
		'url' in part &&
		typeof part.url === 'string' &&
		part.url.startsWith('data:')
	)
}
