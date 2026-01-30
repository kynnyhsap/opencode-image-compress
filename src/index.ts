import type { Plugin, PluginInput } from '@opencode-ai/plugin'
import type { UserMessage } from '@opencode-ai/sdk'

import { processImagePart, isUserMessage } from './image-processor.js'
import type { CompressionStats } from './types.js'
import { isImageFilePart, formatBytes } from './utils.js'

/**
 * Build toast message from compression stats
 */
function buildToastMessage(stats: CompressionStats[]): string {
	const totalOriginal = stats.reduce((sum, s) => sum + s.originalSize, 0)
	const totalCompressed = stats.reduce((sum, s) => sum + s.compressedSize, 0)
	const savings = ((1 - totalCompressed / totalOriginal) * 100).toFixed(0)

	if (stats.length === 1) {
		return `Compressed image: ${formatBytes(totalOriginal)} → ${formatBytes(totalCompressed)} (${savings}% smaller)`
	}

	return `Compressed ${stats.length} images: ${formatBytes(totalOriginal)} → ${formatBytes(totalCompressed)} (${savings}% smaller)`
}

/**
 * Show toast notification if in TUI mode
 */
async function showCompressionToast(ctx: PluginInput, stats: CompressionStats[]): Promise<void> {
	if (stats.length === 0) return

	const message = buildToastMessage(stats)

	try {
		await ctx.client.tui.showToast({
			body: {
				title: 'Image Compress Plugin',
				message,
				variant: 'info',
				duration: 2000,
			},
		})
	} catch (error) {
		// Toast is optional - don't fail if it doesn't work
		console.error('[opencode-image-compress] Failed to show toast:', error)
	}
}

/**
 * OpenCode plugin for automatic image compression
 *
 * Automatically compresses images before sending to AI providers
 * to stay within provider-specific size limits.
 */
const ImageCompressPlugin: Plugin = async (ctx: PluginInput) => {
	return {
		'experimental.chat.messages.transform': async (_input, output) => {
			// Collect all image parts across all messages for concurrent processing
			const tasks: Array<{
				message: (typeof output.messages)[number]
				index: number
				providerID: string
			}> = []

			for (const message of output.messages) {
				if (!message.parts) continue

				let providerID = 'default'
				if (isUserMessage(message.info)) {
					const userInfo = message.info as UserMessage & {
						model?: { providerID?: string }
					}
					providerID = userInfo.model?.providerID || 'default'
				}

				for (let i = 0; i < message.parts.length; i++) {
					if (isImageFilePart(message.parts[i])) {
						tasks.push({ message, index: i, providerID })
					}
				}
			}

			// Process all images concurrently
			const results = await Promise.all(
				tasks.map((task) => processImagePart(task.message.parts[task.index], task.providerID)),
			)

			// Apply results and collect stats
			const compressionStats: CompressionStats[] = []
			for (let i = 0; i < results.length; i++) {
				const result = results[i]
				tasks[i].message.parts[tasks[i].index] = result.part

				if (result.wasCompressed) {
					compressionStats.push({
						originalSize: result.originalSize,
						compressedSize: result.compressedSize,
					})
				}
			}

			await showCompressionToast(ctx, compressionStats)
		},
	}
}

export default ImageCompressPlugin
