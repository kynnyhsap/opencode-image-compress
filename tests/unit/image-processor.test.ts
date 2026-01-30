import { describe, test, expect } from "bun:test"
import type { Part } from "@opencode-ai/sdk"
import sharp from "sharp"

import {
  getProviderLimit,
  isUserMessage,
  processImagePart,
} from "../../src/image-processor.ts"
import { PROVIDER_IMAGE_LIMITS, TARGET_MULTIPLIER } from "../../src/types.ts"

describe("image-processor", () => {
  describe("getProviderLimit", () => {
    test("should return correct limits for known providers", () => {
      expect(getProviderLimit("anthropic")).toBe(5 * 1024 * 1024)
      expect(getProviderLimit("openai")).toBe(20 * 1024 * 1024)
      expect(getProviderLimit("google")).toBe(10 * 1024 * 1024)
    })

    test("should return default for unknown providers", () => {
      expect(getProviderLimit("unknown-provider")).toBe(
        PROVIDER_IMAGE_LIMITS.default,
      )
    })
  })

  describe("isUserMessage", () => {
    test("should return true for user role", () => {
      const info = { role: "user" } as { role: string }
      expect(isUserMessage(info)).toBe(true)
    })

    test("should return false for non-user roles", () => {
      const info = { role: "assistant" } as { role: string }
      expect(isUserMessage(info)).toBe(false)
    })
  })

  describe("processImagePart", () => {
    test("should skip non-image parts", async () => {
      const textPart = { type: "text", text: "hello" } as Part
      const result = await processImagePart(textPart, "anthropic")

      expect(result.wasCompressed).toBe(false)
      expect(result.part).toBe(textPart)
    })

    test("should skip small images", async () => {
      // Create a small base64 image (< 100KB)
      const smallData = Buffer.alloc(50 * 1024).toString("base64")
      const part = {
        type: "file",
        mime: "image/jpeg",
        url: `data:image/jpeg;base64,${smallData}`,
      } as Part

      const result = await processImagePart(part, "anthropic")

      expect(result.wasCompressed).toBe(false)
    })

    // BUG FIX: processImagePart had `as ImageFilePart` cast that was unnecessary
    // once isImageFilePart became a proper type guard. This test verifies the
    // processor correctly handles the narrowed type without casting.
    test("should return original part reference for non-image input", async () => {
      const part = {
        type: "file",
        mime: "application/pdf",
        url: "data:application/pdf;base64,abc",
      } as Part

      const result = await processImagePart(part, "anthropic")
      expect(result.wasCompressed).toBe(false)
      expect(result.originalSize).toBe(0)
      // Should return the exact same object reference
      expect(result.part).toBe(part)
    })

    test("should return wasCompressed false for invalid data URI", async () => {
      const part = {
        type: "file",
        mime: "image/jpeg",
        url: "data:image/jpeg;not-base64",
      } as Part

      const result = await processImagePart(part, "anthropic")
      expect(result.wasCompressed).toBe(false)
      expect(result.originalSize).toBe(0)
    })

    // BUG FIX: processImagePart imported TARGET_MULTIPLIER but duplicated the
    // threshold logic. Verify that images just under maxSize * TARGET_MULTIPLIER
    // are not compressed.
    test("should not compress images under provider target threshold", async () => {
      const maxSize = 5 * 1024 * 1024
      const targetSize = maxSize * TARGET_MULTIPLIER

      // Create a real small JPEG image
      const rawData = Buffer.alloc(100 * 100 * 3)
      const smallJpeg = await sharp(rawData, {
        raw: { width: 100, height: 100, channels: 3 },
      })
        .jpeg({ quality: 50 })
        .toBuffer()

      // Ensure it's under target
      expect(smallJpeg.length).toBeLessThan(targetSize)

      const base64 = smallJpeg.toString("base64")
      const part = {
        type: "file",
        mime: "image/jpeg",
        url: `data:image/jpeg;base64,${base64}`,
      } as Part

      const result = await processImagePart(part, "anthropic")
      expect(result.wasCompressed).toBe(false)
      expect(result.originalSize).toBe(smallJpeg.length)
      expect(result.compressedSize).toBe(smallJpeg.length)
    })
  })
})
