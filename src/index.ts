import type { Plugin, PluginInput } from '@opencode-ai/plugin'
import type { UserMessage } from '@opencode-ai/sdk'

import { compressImage } from './compression.js'
import { processImagePart, isUserMessage } from './image-processor.js'
import { createLogger } from './logger.js'
import { PROVIDER_IMAGE_LIMITS } from './providers.js'
import type { CompressionStats } from './types.js'
import { isImageFilePart, formatBytes, isImageMime } from './utils.js'

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
		'tool.execute.after': async (input, output) => {
			// Only process read tool results with image attachments
			if (input.tool !== 'read') return

			const out = output as {
				title: string
				output: string
				metadata: Record<string, unknown>
				attachments?: Array<{
					id: string
					sessionID: string
					messageID: string
					type: string
					mime: string
					url: string
				}>
			}

			if (!out.attachments || out.attachments.length === 0) return

			// Process each image attachment
			for (const attachment of out.attachments) {
				if (attachment.type !== 'file' || !isImageMime(attachment.mime)) continue
				if (!attachment.url.startsWith('data:')) continue

				// Parse data URL
				const dataUrlMatch = attachment.url.match(/^data:([^;]+);base64,(.+)$/)
				if (!dataUrlMatch) continue

				const [, mime, base64Data] = dataUrlMatch
				const imageBuffer = Buffer.from(base64Data, 'base64')
				const originalSize = imageBuffer.length

				// Use default/anthropic limit for tool results (most restrictive common case)
				const maxSize = PROVIDER_IMAGE_LIMITS['anthropic'] || PROVIDER_IMAGE_LIMITS['default']

				// Skip if already under limit
				if (originalSize <= maxSize) {
					log.debug('image already under limit', {
						tool: input.tool,
						originalSize,
						maxSize,
					})
					continue
				}

				log.info('compressing image from read tool', {
					tool: input.tool,
					originalSize,
					maxSize,
					mime,
				})

				try {
					const compressed = await compressImage(imageBuffer, mime, maxSize, log)

					// Update the attachment URL with compressed data
					attachment.url = `data:${compressed.mime};base64,${compressed.data.toString('base64')}`
					attachment.mime = compressed.mime

					log.info('compressed image in tool result', {
						tool: input.tool,
						originalSize,
						compressedSize: compressed.data.length,
						savings: `${((1 - compressed.data.length / originalSize) * 100).toFixed(0)}%`,
					})
				} catch (error) {
					log.error('failed to compress image in tool result', {
						tool: input.tool,
						error: error instanceof Error ? error.message : String(error),
					})
				}
			}
		},
		'experimental.chat.messages.transform': async (_input, output) => {
			const totalMessages = output.messages.length
			log.debug('transform hook called', { totalMessages })

			// Collect all image parts across all messages for concurrent processing
			const tasks: Array<{
				message: (typeof output.messages)[number]
				index: number
				providerID: string
				modelID?: string
			}> = []

			for (const message of output.messages) {
				if (!message.parts) continue

				let providerID = 'default'
				let modelID: string | undefined
				if (isUserMessage(message.info)) {
					const userInfo = message.info as UserMessage & {
						model?: { providerID?: string; modelID?: string }
					}
					providerID = userInfo.model?.providerID || 'default'
					modelID = userInfo.model?.modelID
				}

				for (let i = 0; i < message.parts.length; i++) {
					if (isImageFilePart(message.parts[i])) {
						tasks.push({ message, index: i, providerID, modelID })
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
				tasks.map((task) =>
					processImagePart(task.message.parts[task.index], task.providerID, task.modelID, log),
				),
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

			const failedCount = results.filter((r) => r.failed).length

			if (compressionStats.length > 0) {
				log.info('compression complete', {
					compressed: compressionStats.length,
					skipped: tasks.length - compressionStats.length - failedCount,
					failed: failedCount,
					stats: compressionStats,
				})
			} else {
				log.debug('no images needed compression')
			}

			if (failedCount > 0) {
				log.warn('some images failed to compress', { failedCount })
			}

			await showCompressionToast(ctx, compressionStats)
			await showErrorToast(ctx, failedCount)
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

/**
 * Show error toast when image compression fails
 */
async function showErrorToast(ctx: PluginInput, failedCount: number): Promise<void> {
	if (!process.env.OPENCODE_IMAGE_COMPRESS_PLUGIN_SHOW_TOAST) return
	if (failedCount === 0) return

	const message =
		failedCount === 1
			? 'Failed to compress 1 image. Original image will be sent as-is.'
			: `Failed to compress ${failedCount} images. Original images will be sent as-is.`

	try {
		await ctx.client.tui.showToast({
			body: {
				title: 'Image Compress Plugin',
				message,
				variant: 'error',
				duration: 3000,
			},
		})
	} catch (error) {
		console.error('[opencode-image-compress] Failed to show error toast:', error)
	}
}
