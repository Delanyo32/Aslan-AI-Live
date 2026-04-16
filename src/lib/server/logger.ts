type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogContext = Record<string, unknown>

export function serializeError(err: unknown): Record<string, unknown> {
	if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack }
	return { raw: String(err) }
}

function log(level: LogLevel, msg: string, ctx?: LogContext) {
	const entry = { level, ts: new Date().toISOString(), msg, ...ctx }
	if (level === 'error' || level === 'warn') console.error(JSON.stringify(entry))
	else console.log(JSON.stringify(entry))
}

export const logger = {
	debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
	info:  (msg: string, ctx?: LogContext) => log('info',  msg, ctx),
	warn:  (msg: string, ctx?: LogContext) => log('warn',  msg, ctx),
	error: (msg: string, ctx?: LogContext) => log('error', msg, ctx),
	serializeError,
}
