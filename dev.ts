import { dirname, join } from "node:path"
import type { Config } from "@opencode-ai/sdk"
import { $, spawn } from "bun"

const scriptDir = dirname(import.meta.path)

console.log("🔨 Building plugin...")
await $`bun run build`.cwd(scriptDir)

const pluginPath = join(scriptDir, "dist", "index.js")

const pluginFile = Bun.file(pluginPath)
if (!(await pluginFile.exists())) {
  console.error(`❌ Error: Plugin not found at ${pluginPath}`)
  process.exit(1)
}

console.log(`✅ Plugin built: ${pluginPath}`)
console.log(`🚀 Starting OpenCode with image-compress plugin...`)
console.log("")
console.log("💡 Tip: Try sending a large image (>5MB) to test compression")
console.log("   You should see a toast notification when compression occurs")
console.log("")

const proc = spawn(["opencode", "--port", "3442"], {
  env: {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      plugin: [`file://${pluginPath}`],
    } satisfies Config),
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

await proc.exited
