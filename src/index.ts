import type { Plugin, PluginInput } from '@opencode-ai/plugin'
import type { UserMessage } from '@opencode-ai/sdk'

import { processImagePart, isUserMessage } from './image-processor.js'
import { createLogger } from './logger.js'
import type { CompressionStats } from './types.js'
import { isImageFilePart, formatBytes } from './utils.js'

/**
 * OpenCode plugin for automatic image compression
 *
 * Automatically compresses images before sending to AI providers
 * to stay within provider-specific size limits.
 */
export const ImageCompressPlugin: Plugin = async (ctx: PluginInput) => {
	const log = createLogger(ctx)

	log.info('plugin initialized')

	return {
		'experimental.chat.messages.transform': async (_input, output) => {
			const totalMessages = output.messages.length
			log.debug('transform hook called', { totalMessages })

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

			if (tasks.length === 0) {
				log.debug('no image parts found, skipping')
				return
			}

			log.info('processing images', {
				count: tasks.length,
				providers: [...new Set(tasks.map((t) => t.providerID))],
			})

			// Process all images concurrently
			const results = await Promise.all(
				tasks.map((task) => processImagePart(task.message.parts[task.index], task.providerID, log)),
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

			if (compressionStats.length > 0) {
				log.info('compression complete', {
					compressed: compressionStats.length,
					skipped: tasks.length - compressionStats.length,
					stats: compressionStats,
				})
			} else {
				log.debug('no images needed compression')
			}

			await showCompressionToast(ctx, compressionStats)
		},
	}
}

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
	if (!process.env.OPENCODE_IMAGE_COMPRESS_PLUGIN_SHOW_TOAST) return
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
		console.error('[opencode-image-compress] Failed to show toast:', error)
	}
}
