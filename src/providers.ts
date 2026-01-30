/**
 * Provider-specific image size limits and proxy resolution.
 *
 * Provider IDs match the OpenCode SDK's provider list (ctx.client.provider.list()).
 * See models.dev for the full registry.
 */

import { MB } from './types.js'

/**
 * Provider-specific image size limits (in bytes)
 *
 * Limits are for decoded image data (before base64 encoding).
 * Each entry includes a source URL for verification.
 */
export const PROVIDER_IMAGE_LIMITS: Record<string, number> = {
	// Anthropic: 5 MB per image (API). Rejects oversized.
	// https://platform.claude.com/docs/en/build-with-claude/vision (FAQ)
	anthropic: 5 * MB,

	// Amazon Bedrock: 3.75 MB per image. Rejects oversized.
	// https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html
	'amazon-bedrock': 3.75 * MB,

	// OpenAI: 20 MB per image. Auto-resizes to 2048x2048.
	// https://learn.microsoft.com/en-us/azure/ai-foundry/openai/quotas-limits
	openai: 20 * MB,

	// Azure: 20 MB per image. Same as OpenAI.
	// https://learn.microsoft.com/en-us/azure/ai-foundry/openai/quotas-limits
	azure: 20 * MB,

	// Google Gemini: 7 MB inline per image. Auto-resizes to ~3072x3072.
	// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-pro
	google: 7 * MB,
	'google-vertex': 7 * MB,

	// Google Vertex with Anthropic models: uses Anthropic's 5 MB limit.
	'google-vertex-anthropic': 5 * MB,

	// Groq: 4 MB for base64, 20 MB for URL. We send base64.
	// https://console.groq.com/docs/vision
	groq: 4 * MB,

	// Fireworks AI: 10 MB total base64, 5 MB per URL.
	// https://docs.fireworks.ai/guides/querying-vision-language-models
	'fireworks-ai': 10 * MB,

	// Perplexity: 50 MB base64.
	// https://docs.perplexity.ai/guides/image-attachments
	perplexity: 50 * MB,

	// xAI (Grok): 20 MB per image.
	// https://docs.x.ai/docs/models
	xai: 20 * MB,

	// DeepSeek: ~10 MB (community consensus, not officially documented).
	deepseek: 10 * MB,

	// Together AI: Not documented. Conservative 20 MB.
	togetherai: 20 * MB,

	// Mistral: Not documented. Conservative 20 MB.
	mistral: 20 * MB,

	// Default for unknown providers (conservative 5 MB)
	default: 5 * MB,
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
	qwen: 'fireworks-ai',
	mistral: 'mistral',
}

/**
 * Providers that proxy requests to upstream providers.
 * For these, we resolve the limit from the model ID instead.
 */
export const PROXY_PROVIDERS = new Set([
	'github-copilot',
	'opencode',
	'github-models',
	'openrouter',
])
