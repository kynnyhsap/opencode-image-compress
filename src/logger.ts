import type { PluginInput } from '@opencode-ai/plugin'

const SERVICE = 'image-compress'

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export type Logger = {
	info: (message: string, extra?: Record<string, unknown>) => void
	warn: (message: string, extra?: Record<string, unknown>) => void
	error: (message: string, extra?: Record<string, unknown>) => void
	debug: (message: string, extra?: Record<string, unknown>) => void
}

/**
 * Create a logger that sends logs to OpenCode's app log system.
 * Logs are fire-and-forget — failures are silently ignored.
 */
export function createLogger(ctx: PluginInput): Logger {
	function log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
		ctx.client.app
			.log({
				body: { service: SERVICE, level, message, extra },
			})
			.catch(() => {})
	}

	return {
		info: (message, extra) => log('info', message, extra),
		warn: (message, extra) => log('warn', message, extra),
		error: (message, extra) => log('error', message, extra),
		debug: (message, extra) => log('debug', message, extra),
	}
}
