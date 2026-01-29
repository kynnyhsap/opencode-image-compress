import type { Plugin } from "@opencode-ai/plugin"
import type { Part } from "@opencode-ai/sdk"
import sharp from "sharp"

/**
 * Maximum size for images (5MB in bytes)
 * Anthropic's limit: 5242880 bytes (5 * 1024 * 1024)
 */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

/**
 * Target size to aim for (slightly under max to account for base64 overhead)
 * Base64 encoding adds ~33% overhead, so we target ~3.5MB raw data
 */
const TARGET_IMAGE_SIZE = 3.5 * 1024 * 1024

/**
 * Maximum dimensions for images
 * Most AI models work well with 2048px on the longest side
 */
const MAX_DIMENSION = 2048

/**
 * Cache for processed images to avoid re-processing
 * Key: base64 data hash, Value: processed base64 data
 */
const imageCache = new Map<string, string>()

/**
 * Simple hash function for base64 strings
 */
function hashBase64(data: string): string {
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(36)
}

/**
 * Parse data URI to extract mime type and base64 data
 */
function parseDataUri(dataUri: string): { mime: string; data: Buffer } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  return {
    mime: match[1],
    data: Buffer.from(match[2], "base64"),
  }
}

/**
 * Compress an image to meet size requirements
 */
async function compressImage(
  imageData: Buffer,
  mime: string,
): Promise<{ data: Buffer; mime: string }> {
  // Check if already under target size
  if (imageData.length <= TARGET_IMAGE_SIZE) {
    return { data: imageData, mime }
  }

  let sharpInstance = sharp(imageData)

  // Get current dimensions
  const metadata = await sharpInstance.metadata()
  const { width = 0, height = 0 } = metadata

  // Calculate scale factor if dimensions are too large
  const maxDim = Math.max(width, height)
  let scale = 1

  if (maxDim > MAX_DIMENSION) {
    scale = MAX_DIMENSION / maxDim
  }

  // Start with quality settings based on format
  let quality = mime === "image/png" ? 9 : 90 // PNG compression level (1-9), JPEG quality (0-100)

  // Try progressively smaller sizes and qualities
  let attempts = 0
  const maxAttempts = 10

  while (attempts < maxAttempts) {
    // Apply resize if needed
    if (scale < 1) {
      sharpInstance = sharp(imageData).resize(
        Math.round(width * scale),
        Math.round(height * scale),
        { fit: "inside", withoutEnlargement: true },
      )
    } else {
      sharpInstance = sharp(imageData)
    }

    // Apply format-specific compression
    let processed: Buffer

    if (mime === "image/jpeg" || mime === "image/jpg") {
      processed = await sharpInstance.jpeg({ quality, progressive: true }).toBuffer()
    } else if (mime === "image/png") {
      // PNG: use compression level (1-9, higher = more compression)
      processed = await sharpInstance
        .png({ compressionLevel: quality, adaptiveFiltering: true })
        .toBuffer()
    } else if (mime === "image/webp") {
      processed = await sharpInstance.webp({ quality }).toBuffer()
    } else if (mime === "image/avif") {
      processed = await sharpInstance.avif({ quality }).toBuffer()
    } else if (mime === "image/gif") {
      // Convert GIF to PNG if it's too large
      processed = await sharpInstance.png({ compressionLevel: quality }).toBuffer()
    } else {
      // For other formats, convert to JPEG
      processed = await sharpInstance.jpeg({ quality, progressive: true }).toBuffer()
    }

    // Check if we're under the target size
    if (processed.length <= TARGET_IMAGE_SIZE) {
      return {
        data: processed,
        mime: mime === "image/gif" ? "image/png" : mime,
      }
    }

    // Reduce quality/scale for next attempt
    if (mime === "image/png") {
      // For PNG, increase compression level (max 9)
      if (quality < 9) {
        quality = Math.min(9, quality + 2)
      } else {
        // Already at max compression, reduce dimensions
        scale *= 0.8
      }
    } else {
      // For other formats, reduce quality
      quality = Math.max(30, quality - 15)
      if (quality <= 30) {
        // Quality getting too low, reduce dimensions instead
        scale *= 0.8
        quality = mime === "image/png" ? 9 : 85
      }
    }

    attempts++
  }

  // If we still haven't met the target, force a smaller size
  sharpInstance = sharp(imageData).resize(
    Math.round(width * 0.5),
    Math.round(height * 0.5),
    { fit: "inside" },
  )

  const finalBuffer =
    mime === "image/png"
      ? await sharpInstance.png({ compressionLevel: 9 }).toBuffer()
      : await sharpInstance.jpeg({ quality: 70, progressive: true }).toBuffer()

  return {
    data: finalBuffer,
    mime: mime === "image/png" ? "image/png" : "image/jpeg",
  }
}

/**
 * Check if a part is an image file part
 */
function isImageFilePart(part: Part): part is Part & { type: "file"; mime: string; url: string } {
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
 * Process an image part and return compressed version if needed
 */
async function processImagePart(part: Part): Promise<Part> {
  // Check if this is an image file part with data URI
  if (!isImageFilePart(part)) {
    return part
  }

  // Check cache first
  const cacheKey = hashBase64(part.url)
  const cached = imageCache.get(cacheKey)
  if (cached) {
    return {
      ...part,
      url: cached,
    }
  }

  // Parse the data URI
  const parsed = parseDataUri(part.url)
  if (!parsed) return part

  // Check if compression is needed
  if (parsed.data.length <= TARGET_IMAGE_SIZE) {
    return part
  }

  try {
    // Compress the image
    const compressed = await compressImage(parsed.data, parsed.mime)

    // Create new data URI
    const newDataUri = `data:${compressed.mime};base64,${compressed.data.toString("base64")}`

    // Cache the result
    imageCache.set(cacheKey, newDataUri)

    // Limit cache size (keep last 50 entries)
    if (imageCache.size > 50) {
      const firstKey = imageCache.keys().next().value
      if (firstKey) {
        imageCache.delete(firstKey)
      }
    }

    return {
      ...part,
      url: newDataUri,
      mime: compressed.mime,
    }
  } catch (error) {
    // If compression fails, return original
    console.error("[opencode-image-compress] Failed to compress image:", error)
    return part
  }
}

/**
 * OpenCode plugin for automatic image compression
 *
 * This plugin intercepts messages before they're sent to the AI provider
 * and compresses any images that exceed the provider's size limits.
 *
 * Usage:
 * 1. Install the plugin: npm install opencode-image-compress
 * 2. Add to your opencode.json: "plugin": ["opencode-image-compress"]
 */
const ImageCompressPlugin: Plugin = async (_ctx) => {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      // Process all messages and their parts
      for (const message of output.messages) {
        if (!message.parts) continue

        // Process each part in the message
        for (let i = 0; i < message.parts.length; i++) {
          const part = message.parts[i]

          if (isImageFilePart(part)) {
            const processedPart = await processImagePart(part)
            message.parts[i] = processedPart
          }
        }
      }
    },
  }
}

export default ImageCompressPlugin
