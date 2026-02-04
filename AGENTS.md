# Project Guidelines

## Plugin Development

### Building & Testing

- **Always rebuild after source changes**: Plugin loads from `dist/`, not `src/`. Run `bun run build` after any changes.
- **Check if plugin is loaded**: `OPENCODE_CONFIG_CONTENT='{"plugin":["..."]}' opencode debug config | jq '.plugin'`

### Plugin Hooks

- `tool.execute.before` and `tool.execute.after` take two parameters: `(input, output)` - not just one.
- `tool.execute.after` output for read tool has `attachments` array with `{type, mime, url}` where `url` is a data URL.
- Mutating `output.attachments[].url` in `tool.execute.after` DOES affect what gets sent to the LLM API.
- Hooks run in the plugin subprocess - `console.log` output won't appear in terminal. Use file logging or the plugin's log system for debugging.

### Read Tool Image Flow

When the Read tool reads an image:
1. Creates base64 data URL in `attachments[0].url` (can be 30+ MB for 4K images)
2. `tool.execute.after` hook receives result with attachments
3. If attachment URL is modified, the modified version is sent to the API
4. Error "image exceeds 5 MB maximum" comes from Anthropic API AFTER tool execution completes

### Debugging Plugin Issues

- Use `--print-logs --log-level DEBUG` to see plugin logs in terminal
- Plugin `event` hook receives all OpenCode events - useful for understanding the event flow
- Write to a file in the project directory for debugging (e.g., `debug.log`) - `/tmp/` may not work depending on subprocess context
