# OpenCode Image Compress Plugin

Automatically compresses images before sending them to AI providers, preventing "image exceeds maximum" errors.

## Problem

Different AI providers have different image size limits:
- **Anthropic**: 5MB per image
- **OpenAI**: 50MB total request (~20MB per image effectively)
- **Google**: No explicit limit (we use 10MB as conservative default)

High-resolution screenshots (especially @2x Retina displays) often exceed these limits, causing errors like:

```
messages.284.content.1.image.source.base64: image exceeds 5 MB maximum: 7082276 bytes > 5242880 bytes
```

## Solution

This plugin automatically intercepts images before they're sent and compresses them to stay under the provider-specific limits while maintaining visual quality. It detects which provider you're using and applies the appropriate limit.

## Installation

### Option 1: Global (all projects)

```bash
# Navigate to your global OpenCode directory
cd ~/.config/opencode

# Install the plugin
npm install opencode-image-compress
```

Then add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-image-compress"]
}
```

### Option 2: Per-project

```bash
# In your project directory
mkdir -p .opencode
cd .opencode
npm init -y
npm install opencode-image-compress
```

Then add to your project's `opencode.json`:

```json
{
  "plugin": ["opencode-image-compress"]
}
```

## How It Works

1. **Intercept**: The plugin uses the `experimental.chat.messages.transform` hook to intercept messages before they're sent
2. **Detect Provider**: Extracts the provider ID (e.g., "anthropic", "openai") from the message metadata
3. **Apply Limits**: Uses provider-specific size limits (see table below)
4. **Compress**: Uses `sharp` to resize and compress images that exceed the target size
5. **Cache**: Stores processed images in memory to avoid re-processing the same image

### Provider-Specific Limits

| Provider | Image Size Limit | Target Size (70%) |
|----------|-----------------|-------------------|
| Anthropic | 5 MB | 3.5 MB |
| OpenAI | 20 MB | 14 MB |
| Azure | 20 MB | 14 MB |
| GitHub Copilot | 20 MB | 14 MB |
| Google | 10 MB | 7 MB |
| Google Vertex | 10 MB | 7 MB |
| Other/Unknown | 5 MB | 3.5 MB |

### Compression Strategy

The plugin uses a multi-step approach:

1. **Check size**: Skip if already under the provider's target size
2. **Resize**: Scale down if dimensions exceed 2048px
3. **Quality reduction**: Reduce quality progressively (JPEG/WebP/AVIF)
4. **Format optimization**: Use PNG compression levels for PNGs
5. **Fallback**: Convert to JPEG if other methods don't work

### Supported Formats

- JPEG/JPG
- PNG
- WebP
- AVIF
- GIF (converted to PNG)
- Other formats (converted to JPEG)

## Configuration

Currently, the plugin uses sensible defaults:

- **Target size**: 3.5MB (allows for base64 overhead)
- **Max dimensions**: 2048px (most AI models handle this well)
- **Cache size**: 50 images

Future versions may support configuration via `opencode.json`.

## Development

```bash
# Clone and setup
git clone <repo>
cd opencode-image-compress-plugin
npm install

# Build
npm run build

# Test locally
# Link to your opencode plugins folder
ln -s $(pwd) ~/.config/opencode/plugins/opencode-image-compress
```

## Requirements

- OpenCode CLI >= 1.0.0
- Node.js >= 18
- `sharp` native dependencies (auto-installed)

## License

MIT

## Contributing

PRs welcome! Please ensure:

1. Code follows existing patterns
2. Test with various image sizes and formats
3. Ensure compression doesn't significantly degrade image quality for AI tasks
