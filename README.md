# OpenCode Image Compress Plugin

Automatically compresses images before sending them to AI providers, preventing "image exceeds 5MB maximum" errors.

## Problem

AI providers like Anthropic have a 5MB limit on image uploads. High-resolution screenshots (especially @2x Retina displays) often exceed this limit, causing errors like:

```
messages.284.content.1.image.source.base64: image exceeds 5 MB maximum: 7082276 bytes > 5242880 bytes
```

## Solution

This plugin automatically intercepts images before they're sent and compresses them to stay under the 5MB limit while maintaining visual quality.

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
2. **Detect**: Identifies image parts in the message
3. **Compress**: Uses `sharp` to resize and compress images that exceed 3.5MB (targeting under 5MB after base64 encoding)
4. **Cache**: Stores processed images in memory to avoid re-processing the same image

### Compression Strategy

The plugin uses a multi-step approach:

1. **Check size**: Skip if already under 3.5MB
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
