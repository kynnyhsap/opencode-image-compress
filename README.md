# opencode-image-compress

[OpenCode](https://opencode.ai) plugin that automatically compresses images before sending them to AI providers, preventing "image exceeds maximum" errors.

## Problem

High-resolution screenshots (especially @2x Retina displays) often exceed provider size limits:

```
image exceeds 5 MB maximum: 7082276 bytes > 5242880 bytes
```

## Installation

Add to your `opencode.json` (global or per-project):

```json
{
	"plugin": ["opencode-image-compress"]
}
```

That's it. OpenCode will automatically install the plugin on next launch.

## How It Works

The plugin intercepts images via the `experimental.chat.messages.transform` hook, detects the provider, and compresses images that exceed provider-specific limits.

### Provider Limits

| Provider       | Limit | Target (70%) |
| -------------- | ----- | ------------ |
| Anthropic      | 5 MB  | 3.5 MB       |
| OpenAI         | 20 MB | 14 MB        |
| Azure          | 20 MB | 14 MB        |
| GitHub Copilot | 20 MB | 14 MB        |
| Google         | 10 MB | 7 MB         |
| Google Vertex  | 10 MB | 7 MB         |
| Other/Unknown  | 5 MB  | 3.5 MB       |

### Compression Strategy

1. Skip if already under target
2. Scale down if dimensions exceed 2048px
3. Reduce quality progressively (JPEG/WebP/AVIF)
4. PNG: increase compression level, then shrink dimensions
5. Fallback: aggressive resize to 1024px

### Supported Formats

JPEG, PNG, WebP, AVIF, GIF (converted to PNG), other formats (converted to JPEG).

### Caching

Compressed images are cached in memory (up to 100 entries) to avoid re-processing.

### Logging

The plugin logs to OpenCode's app log system (`service: "image-compress"`). View logs in the TUI or via the API.

### Toast Notifications

Set `OPENCODE_IMAGE_COMPRESS_PLUGIN_SHOW_TOAST=1` to show TUI toast notifications when images are compressed.

## Development

```bash
git clone https://github.com/kynnyhsap/opencode-image-compress.git
cd opencode-image-compress
bun install

# Run OpenCode with the plugin loaded from source
bun dev

# Lint, format, typecheck
bun lint
bun fmt
bun typecheck

# Tests
bun test:unit
E2E_TESTS=1 bun test:e2e
```

## License

MIT
