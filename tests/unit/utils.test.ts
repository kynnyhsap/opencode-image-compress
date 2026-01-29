import { describe, test, expect } from "bun:test"
import {
  hashBase64,
  formatBytes,
  parseDataUri,
  isImageFilePart,
  getCacheKey,
  getCachedImage,
  setCachedImage,
  getSizeFromDataUri,
} from "../src/utils"
import type { Part } from "@opencode-ai/sdk"

describe("utils", () => {
  describe("hashBase64", () => {
    test("should produce consistent hashes", () => {
      const data = "test data for hashing"
      const hash1 = hashBase64(data)
      const hash2 = hashBase64(data)
      expect(hash1).toBe(hash2)
    })

    test("should produce different hashes for different data", () => {
      const hash1 = hashBase64("data1")
      const hash2 = hashBase64("data2")
      expect(hash1).not.toBe(hash2)
    })
  })

  describe("formatBytes", () => {
    test("should format bytes", () => {
      expect(formatBytes(500)).toBe("500 B")
    })

    test("should format kilobytes", () => {
      expect(formatBytes(1536)).toBe("1.5 KB")
    })

    test("should format megabytes", () => {
      expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB")
    })
  })

  describe("parseDataUri", () => {
    test("should parse valid data URI", () => {
      const base64 = Buffer.from("test").toString("base64")
      const uri = `data:image/png;base64,${base64}`
      const parsed = parseDataUri(uri)

      expect(parsed).not.toBeNull()
      expect(parsed?.mime).toBe("image/png")
      expect(parsed?.data.toString()).toBe("test")
    })

    test("should return null for invalid URI", () => {
      expect(parseDataUri("not a data uri")).toBeNull()
      expect(parseDataUri("data:image/png;base64,")).toBeNull()
    })
  })

  describe("isImageFilePart", () => {
    test("should return true for image file parts", () => {
      const part = {
        type: "file",
        mime: "image/jpeg",
        url: "data:image/jpeg;base64,abc123",
      } as Part

      expect(isImageFilePart(part)).toBe(true)
    })

    test("should return false for non-image parts", () => {
      const textPart = { type: "text", text: "hello" } as Part
      expect(isImageFilePart(textPart)).toBe(false)
    })

    test("should return false for non-data URL images", () => {
      const part = {
        type: "file",
        mime: "image/jpeg",
        url: "https://example.com/image.jpg",
      } as Part

      expect(isImageFilePart(part)).toBe(false)
    })
  })

  describe("cache operations", () => {
    test("should store and retrieve from cache", () => {
      const key = getCacheKey("anthropic", "test-data-uri")
      setCachedImage(key, "compressed-data-uri")

      expect(getCachedImage(key)).toBe("compressed-data-uri")
    })

    test("should evict old entries when over limit", () => {
      // Fill cache beyond limit
      for (let i = 0; i < 110; i++) {
        setCachedImage(`key-${i}`, `value-${i}`)
      }

      // First entries should be evicted
      expect(getCachedImage("key-0")).toBeUndefined()
      expect(getCachedImage("key-50")).toBeUndefined()

      // Recent entries should exist
      expect(getCachedImage("key-105")).toBe("value-105")
    })
  })

  describe("getSizeFromDataUri", () => {
    test("should calculate approximate size", () => {
      const base64 = Buffer.from("test data").toString("base64")
      const uri = `data:text/plain;base64,${base64}`
      const size = getSizeFromDataUri(uri)

      // Should be approximately 9 bytes (length of "test data")
      expect(size).toBeGreaterThan(5)
      expect(size).toBeLessThan(15)
    })
  })
})
