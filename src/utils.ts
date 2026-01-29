import type { Part } from "@opencode-ai/sdk"

/**
 * Cache for processed images to avoid re-processing
 * Key: `${providerID}:${base64Hash}`, Value: processed base64 data
 */
const imageCache = new Map<string, string>()

/**
 * Maximum cache entries before eviction
 */
const MAX_CACHE_SIZE = 100

/**
 * Simple hash function for base64 strings
 */
export function hashBase64(data: string): string {
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(36)
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Parse data URI to extract mime type and base64 data
 */
export function parseDataUri(
  dataUri: string,
): { mime: string data: Buffer } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  return {
    mime: match[1],
    data: Buffer.from(match[2], "base64"),
  }
}

/**
 * Check if a part is an image file part
 */
export function isImageFilePart(part: Part): boolean {
  return (
    part.type === "file" &&
    "mime" in part &&
    typeof part.mime === "string" &&
    part.mime.startsWith("image/") &&
    "url" in part &&
    typeof part.url === "string" &&
    part.url.startsWith("data:")
  )
}

/**
 * Get cached image if available
 */
export function getCachedImage(cacheKey: string): string | undefined {
  return imageCache.get(cacheKey)
}

/**
 * Store image in cache with LRU eviction
 */
export function setCachedImage(cacheKey: string, dataUri: string): void {
  imageCache.set(cacheKey, dataUri)

  // Evict oldest entries if over limit
  if (imageCache.size > MAX_CACHE_SIZE) {
    const firstKey = imageCache.keys().next().value
    if (firstKey) {
      imageCache.delete(firstKey)
    }
  }
}

/**
 * Calculate cache key for an image
 */
export function getCacheKey(providerID: string, imageUrl: string): string {
  return `${providerID}:${hashBase64(imageUrl)}`
}

/**
 * Calculate approximate size from base64 data URI
 */
export function getSizeFromDataUri(dataUri: string): number {
  // Base64 is ~4/3 of binary size, so binary is ~3/4 of base64
  const base64Data = dataUri.split(",")[1]
  return Math.ceil(base64Data.length * 0.75)
}
