import { describe, test, expect } from "bun:test"
import {
  getProviderLimit,
  isUserMessage,
  processImagePart,
} from "../../src/image-processor.ts"
import { PROVIDER_IMAGE_LIMITS } from "../../src/types.ts"
import type { Part } from "@opencode-ai/sdk"

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
  })
})
