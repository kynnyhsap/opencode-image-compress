/**
 * Provider-specific image size limits and proxy resolution.
 *
 * Provider IDs match the OpenCode SDK's provider list (client.provider.list()).
 * See models.dev for the full registry.
 */

import { MB } from './types.js'

/**
 * Provider-specific image size limits (in bytes)
 *
 * Limits are for decoded image data (before base64 encoding).
 * Each entry includes a source URL for verification.
 *
 * Last verified: 2026-01-30
 */
export const PROVIDER_IMAGE_LIMITS: Record<string, number> = {
	// Anthropic: 5 MB per image (API), 10 MB (web), 32 MB total request. Rejects oversized.
	// https://platform.claude.com/docs/en/build-with-claude/vision (FAQ section)
	// https://github.com/anthropics/claude-code/issues/2146
	anthropic: 5 * MB,

	// Amazon Bedrock: 3.75 MB per image (decoded). 5 MB encoded limit / 1.33 = 3.75 MB.
	// Max 20 images, max 8000x8000 px. Rejects oversized.
	// https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html
	// https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
	// https://github.com/aws/aws-sdk-js-v3/issues/6785
	'amazon-bedrock': 3.75 * MB,

	// OpenAI: 20 MB per image (ChatGPT/API). 50 MB total payload per request.
	// Auto-resizes longest side to 2048px, shortest to 768px. Max 500 images.
	// https://help.openai.com/en/articles/8983719-what-are-the-file-upload-size-restrictions
	// https://platform.openai.com/docs/guides/images
	openai: 20 * MB,

	// Azure OpenAI: 20 MB per image. Same processing as OpenAI. Max 50 images.
	// https://learn.microsoft.com/en-us/azure/ai-foundry/openai/quotas-limits
	azure: 20 * MB,

	// Google Gemini (AI Studio): 100 MB inline per request (raised from 20 MB on Jan 12, 2026).
	// Auto-resizes to ~3072x3072. Max 3000 images.
	// https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-new-file-limits/
	// https://ai.google.dev/gemini-api/docs/file-input-methods
	google: 100 * MB,

	// Google Vertex AI: 7 MB per image inline. Different from AI Studio limits.
	// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-pro
	// https://firebase.google.com/docs/ai-logic/analyze-images
	'google-vertex': 7 * MB,

	// Google Vertex with Anthropic models: follows Anthropic's 5 MB limit.
	'google-vertex-anthropic': 5 * MB,

	// Groq: 4 MB for base64, 20 MB for URL. Max 5 images, max 33 megapixels.
	// https://console.groq.com/docs/vision
	groq: 4 * MB,

	// Fireworks AI: 10 MB total base64, 5 MB per URL. Max 30 images.
	// https://docs.fireworks.ai/guides/querying-vision-language-models
	'fireworks-ai': 10 * MB,

	// Perplexity: 50 MB base64 per attachment.
	// https://docs.perplexity.ai/guides/image-attachments
	// https://www.datastudios.org/post/perplexity-ai-file-uploading-size-limits-supported-formats-plan-differences-and-workflow-strateg
	perplexity: 50 * MB,

	// xAI (Grok): 20 MiB per image (API).
	// https://docs.x.ai/docs/models
	// https://www.datastudios.org/post/grok-4-file-upload-limits-supported-formats-size-caps-and-processing-behavior-in-late-2025
	xai: 20 * MB,

	// DeepSeek: ~10 MB (community consensus, not officially documented).
	// https://merlio.app/blog/deepseek-image-upload-limits-merlio
	deepseek: 10 * MB,

	// Together AI: Not documented. Conservative 20 MB.
	// https://docs.together.ai/docs/images-overview (no vision upload limits found)
	togetherai: 20 * MB,

	// Mistral: 10 MB per image (Vision API).
	// https://platform-docs-public.pages.dev/capabilities/vision/
	mistral: 10 * MB,

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
