/**
 * Type definitions for opencode-image-compress plugin
 */

import type { Part } from '@opencode-ai/sdk'

/**
 * Provider-specific image size limits (in bytes)
 *
 * Limits are for decoded image data (before base64 encoding).
 * Each entry includes a source URL for verification.
 */
export const PROVIDER_IMAGE_LIMITS: Record<string, number> = {
	// Anthropic: 5 MB per image (API). Rejects oversized.
	// https://platform.claude.com/docs/en/build-with-claude/vision (FAQ)
	anthropic: 5 * 1024 * 1024,
	'anthropic-beta': 5 * 1024 * 1024,

	// AWS Bedrock: 3.75 MB per image. Rejects oversized.
	// https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html
	bedrock: 3.75 * 1024 * 1024,
	'aws-bedrock': 3.75 * 1024 * 1024,

	// OpenAI: 20 MB per image. Auto-resizes to 2048x2048.
	// https://learn.microsoft.com/en-us/azure/ai-foundry/openai/quotas-limits
	openai: 20 * 1024 * 1024,

	// Azure OpenAI: 20 MB per image. Same as OpenAI.
	// https://learn.microsoft.com/en-us/azure/ai-foundry/openai/quotas-limits
	azure: 20 * 1024 * 1024,
	'azure-openai': 20 * 1024 * 1024,

	// Google Gemini: 7 MB inline per image. Auto-resizes to ~3072x3072.
	// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-pro
	google: 7 * 1024 * 1024,
	'google-vertex': 7 * 1024 * 1024,
	vertex: 7 * 1024 * 1024,

	// Groq: 4 MB for base64, 20 MB for URL. We send base64.
	// https://console.groq.com/docs/vision
	groq: 4 * 1024 * 1024,

	// Fireworks AI: 10 MB total base64, 5 MB per URL.
	// https://docs.fireworks.ai/guides/querying-vision-language-models
	fireworks: 10 * 1024 * 1024,

	// Perplexity: 50 MB base64.
	// https://docs.perplexity.ai/guides/image-attachments
	perplexity: 50 * 1024 * 1024,

	// xAI (Grok): 20 MB per image.
	// https://docs.x.ai/docs/models
	xai: 20 * 1024 * 1024,

	// DeepSeek: ~10 MB (community consensus, not officially documented).
	deepseek: 10 * 1024 * 1024,

	// Together AI: Not documented. Conservative 20 MB.
	together: 20 * 1024 * 1024,
	'together-ai': 20 * 1024 * 1024,

	// Default for unknown providers (conservative 5 MB)
	default: 5 * 1024 * 1024,
}

/**
 * Model ID prefix to upstream provider mapping.
 * Used to resolve the actual provider for proxy providers
 * (e.g. github-copilot, opencode) that forward to upstream APIs.
 */
export const MODEL_PREFIX_TO_PROVIDER: Record<string, string> = {
	claude: 'anthropic',
	gpt: 'openai',
	o1: 'openai',
	o3: 'openai',
	o4: 'openai',
	gemini: 'google',
	grok: 'xai',
	deepseek: 'deepseek',
	llama: 'groq',
	mixtral: 'groq',
	qwen: 'fireworks',
}

/**
 * Providers that proxy requests to upstream providers.
 * For these, we resolve the limit from the model ID instead.
 */
export const PROXY_PROVIDERS = new Set(['github-copilot', 'copilot', 'opencode'])

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
