/**
 * Type definitions for opencode-image-compress plugin
 */

import type { Part } from "@opencode-ai/sdk"

/**
 * Provider-specific image size limits (in bytes)
 *
 * Different providers have different limits even for the same models.
 * For example, claude-opus-4-5 has different limits:
 *   - anthropic: 5MB (direct API)
 *   - github-copilot: 20MB (through Copilot)
 *   - opencode: 5MB (proxied through opencode)
 */
export const PROVIDER_IMAGE_LIMITS: Record<string, number> = {
  // Anthropic: 5MB per image (most restrictive)
  // Error: "image exceeds 5 MB maximum: 7082276 bytes > 5242880 bytes"
  anthropic: 5 * 1024 * 1024,
  "anthropic-beta": 5 * 1024 * 1024,

  // OpenCode built-in provider (uses same limits as upstream)
  // When opencode proxies to anthropic models, it's subject to anthropic limits
  opencode: 5 * 1024 * 1024,

  // GitHub Copilot: Higher limits (Microsoft infrastructure)
  // Same models as anthropic but with 20MB limit
  "github-copilot": 20 * 1024 * 1024,
  copilot: 20 * 1024 * 1024,

  // OpenAI and Azure: 50MB total request, ~20MB per image
  openai: 20 * 1024 * 1024,
  azure: 20 * 1024 * 1024,
  "azure-openai": 20 * 1024 * 1024,

  // Google/Gemini: No explicit per-image limit, conservative 10MB
  google: 10 * 1024 * 1024,
  "google-vertex": 10 * 1024 * 1024,
  vertex: 10 * 1024 * 1024,

  // Perplexity: Similar to OpenAI (uses underlying models)
  perplexity: 20 * 1024 * 1024,

  // Other providers with generous limits
  groq: 20 * 1024 * 1024,
  fireworks: 20 * 1024 * 1024,
  together: 20 * 1024 * 1024,
  "together-ai": 20 * 1024 * 1024,
  deepseek: 20 * 1024 * 1024,
  xai: 20 * 1024 * 1024,

  // Default for unknown providers (conservative 5MB)
  default: 5 * 1024 * 1024,
}

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
}

/**
 * Image file part type guard result
 */
export type ImageFilePart = Part & {
  type: "file"
  mime: string
  url: string
}
