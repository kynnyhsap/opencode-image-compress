import { describe, test, expect } from "bun:test"
import sharp from "sharp"
import { compressImage } from "../../src/compression.ts"

describe("compression", () => {
  /**
   * Helper to create test image buffer
   */
  async function createImageBuffer(
    width: number,
    height: number,
    format: "jpeg" | "png",
    quality: number,
  ): Promise<Buffer> {
    const data = Buffer.alloc(width * height * 3)
    for (let i = 0; i < data.length; i += 3) {
      const x = (i / 3) % width
      const y = Math.floor(i / 3 / width)
      const pattern = (x * 2 + y * 3) % 256
      const noise = Math.random() * 50
      data[i] = Math.min(255, pattern + noise)
      data[i + 1] = Math.min(255, ((pattern + 100) % 256) + noise)
      data[i + 2] = Math.min(255, ((pattern + 200) % 256) + noise)
    }

    const img = sharp(data, { raw: { width, height, channels: 3 } })

    if (format === "jpeg") {
      return img.jpeg({ quality, progressive: true }).toBuffer()
    } else {
      return img.png({ compressionLevel: quality }).toBuffer()
    }
  }

  describe("compressImage", () => {
    test("should not compress images under target size", async () => {
      const buffer = await createImageBuffer(100, 100, "jpeg", 80)
      const result = await compressImage(buffer, "image/jpeg", 5 * 1024 * 1024)

      // Should return original
      expect(result.data.length).toBe(buffer.length)
      expect(result.mime).toBe("image/jpeg")
    })

    test("should compress large JPEG images", async () => {
      const buffer = await createImageBuffer(4096, 3072, "jpeg", 95)
      expect(buffer.length).toBeGreaterThan(5 * 1024 * 1024)

      const result = await compressImage(buffer, "image/jpeg", 5 * 1024 * 1024)

      // Should be smaller
      expect(result.data.length).toBeLessThan(buffer.length)
      // Should be under 5MB
      expect(result.data.length).toBeLessThan(5 * 1024 * 1024)
    })

    test("should resize images over max dimension when needed", async () => {
      // Create a very large image that will definitely need resizing
      const buffer = await createImageBuffer(8192, 8192, "jpeg", 95)
      // 20MB limit but 70% target = 14MB, large image should trigger resize
      const result = await compressImage(buffer, "image/jpeg", 20 * 1024 * 1024)

      const metadata = await sharp(result.data).metadata()
      // After aggressive compression, should be resized
      expect(metadata.width).toBeLessThanOrEqual(4096)
      expect(metadata.height).toBeLessThanOrEqual(4096)
    })

    test("should handle PNG images", async () => {
      const buffer = await createImageBuffer(2048, 1536, "png", 6)
      const result = await compressImage(buffer, "image/png", 5 * 1024 * 1024)

      expect(result.mime).toBe("image/png")
    })

    test("should preserve aspect ratio", async () => {
      const buffer = await createImageBuffer(4000, 2000, "jpeg", 90) // 2:1 ratio
      const result = await compressImage(buffer, "image/jpeg", 5 * 1024 * 1024)

      const metadata = await sharp(result.data).metadata()
      // Aspect ratio should be preserved (within rounding)
      const originalRatio = 4000 / 2000
      const newRatio = (metadata.width || 1) / (metadata.height || 1)
      expect(Math.abs(originalRatio - newRatio)).toBeLessThan(0.1)
    })
  })
})
