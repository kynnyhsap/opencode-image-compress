import sharp from "sharp"
import { MAX_DIMENSION } from "./types.js"

/**
 * Compression options
 */
type CompressionOptions = {
  /** Maximum target size in bytes */
  maxSize: number
  /** Quality multiplier (0-1) */
  targetMultiplier?: number
}

/**
 * Compress an image to meet size requirements
 */
export async function compressImage(
  imageData: Buffer,
  mime: string,
  maxSize: number
): Promise<{ data: Buffer; mime: string }> {
  const targetSize = maxSize * 0.7

  // Skip if already under target
  if (imageData.length <= targetSize) {
    return { data: imageData, mime }
  }

  const metadata = await sharp(imageData).metadata()
  const { width = 0, height = 0 } = metadata

  // Calculate initial scale based on max dimension
  const maxDim = Math.max(width, height)
  let scale = maxDim > MAX_DIMENSION ? MAX_DIMENSION / maxDim : 1

  // Start with format-appropriate quality
  let quality = getInitialQuality(mime)

  // Progressive compression attempts
  for (let attempt = 0; attempt < 10; attempt++) {
    const resized = await resizeImage(imageData, width, height, scale)
    const processed = await compressWithQuality(resized, mime, quality)

    if (processed.length <= targetSize) {
      return {
        data: processed,
        mime: mime === "image/gif" ? "image/png" : mime,
      }
    }

    // Adjust quality/scale for next attempt
    const adjustment = calculateAdjustment(mime, quality, attempt)
    quality = adjustment.quality
    scale = adjustment.scale
  }

  // Fallback: aggressive resize
  return aggressiveCompression(imageData, mime)
}

/**
 * Get initial quality setting based on format
 */
function getInitialQuality(mime: string): number {
  if (mime === "image/png") return 9 // PNG compression level (1-9)
  return 90 // JPEG/WebP/AVIF quality (0-100)
}

/**
 * Resize image with sharp
 */
async function resizeImage(
  imageData: Buffer,
  width: number,
  height: number,
  scale: number
): Promise<sharp.Sharp> {
  if (scale >= 1) {
    return sharp(imageData)
  }

  return sharp(imageData).resize(
    Math.round(width * scale),
    Math.round(height * scale),
    { fit: "inside", withoutEnlargement: true }
  )
}

/**
 * Compress image with specific quality settings
 */
async function compressWithQuality(
  sharpInstance: sharp.Sharp,
  mime: string,
  quality: number
): Promise<Buffer> {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return sharpInstance.jpeg({ quality, progressive: true }).toBuffer()

    case "image/png":
      return sharpInstance
        .png({ compressionLevel: quality, adaptiveFiltering: true })
        .toBuffer()

    case "image/webp":
      return sharpInstance.webp({ quality }).toBuffer()

    case "image/avif":
      return sharpInstance.avif({ quality }).toBuffer()

    case "image/gif":
      // Convert GIF to PNG for better compression
      return sharpInstance.png({ compressionLevel: quality }).toBuffer()

    default:
      // Convert unknown formats to JPEG
      return sharpInstance.jpeg({ quality, progressive: true }).toBuffer()
  }
}

/**
 * Calculate quality and scale adjustments for next compression attempt
 */
function calculateAdjustment(
  mime: string,
  currentQuality: number,
  attempt: number
): { quality: number; scale: number } {
  if (mime === "image/png") {
    // PNG: increase compression level, then reduce dimensions
    if (currentQuality < 9) {
      return { quality: Math.min(9, currentQuality + 2), scale: 1 }
    }
    return { quality: 9, scale: 0.8 }
  }

  // Other formats: reduce quality, then reduce dimensions
  const newQuality = Math.max(30, currentQuality - 15)
  if (newQuality <= 30) {
    return { quality: mime === "image/png" ? 9 : 85, scale: 0.8 }
  }

  return { quality: newQuality, scale: 1 }
}

/**
 * Aggressive fallback compression
 */
async function aggressiveCompression(
  imageData: Buffer,
  mime: string
): Promise<{ data: Buffer; mime: string }> {
  const sharpInstance = sharp(imageData).resize(
    Math.round(1024),
    Math.round(1024),
    { fit: "inside" }
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
