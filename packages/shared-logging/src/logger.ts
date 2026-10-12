import winston, { format } from 'winston';
import 'winston-daily-rotate-file';

/**
 * Winston's own `Logger`, re-exported under this package's name.
 *
 * A dependent that writes `const logger = createLogger(...)` would otherwise
 * have to name `winston.Logger` through this package's nested `node_modules`,
 * which `tsc` refuses to emit into a `.d.ts` (TS2883) because the path does
 * not exist for a consumer installing from the registry. Annotating against
 * `Logger` keeps the reference on `@nxgt/shared-logging`, which every
 * dependent already declares.
 */
export type Logger = winston.Logger;

let logger: Logger;

export function createLogger(options: {
	tag?: string;
	name: string;
	disableConsole?: boolean;
}): Logger {
	const { colorize, combine, timestamp, label, printf } = format;

	// `requestId` is child-logger metadata (see `loggerProvider`). A line
	// without one keeps the original `[ts] [label] [level] message` bytes.
	const customFormat = printf(
		({ level, message, label, timestamp, requestId }) => {
			const id = requestId ? ` [requestId=${requestId}]` : '';
			return `[${timestamp}] [${label}] [${level}]${id} ${message}`;
		},
	);

	// `logger.error(error)` hands winston the error itself as the line, and
	// `colorize` then rewrites its `message` in place: the caller's error came
	// back with escape codes, and one whose `message` is read-only (a
	// DOMException, such as an aborted fetch) made the call throw. The line is
	// a copy instead.
	const copyError = format((info) => {
		if (!(info instanceof Error)) return info;
		const copy: winston.Logform.TransformableInfo = {
			...info,
			message: info.message,
		};
		if (info.stack !== undefined) copy['stack'] = info.stack;
		return copy;
	});

	const fileRotateTransport = new winston.transports.DailyRotateFile({
		filename: `logs/${options.name}-%DATE%.log`,
		datePattern: 'YYYY-MM-DD',
		maxFiles: '14d',
	});

	return winston.createLogger({
		level: Bun.env['LOG_LEVEL'] || 'info',
		format: combine(
			copyError(),
			colorize({ all: true }),
			label({ label: options.tag ?? (Bun.env['LOG_TAG'] || 'app') }),
			timestamp({ format: 'YYYY-DD-MM HH:mm:ss' }),
			customFormat,
		),
		transports: [
			...(options.disableConsole ? [] : [new winston.transports.Console()]),
			fileRotateTransport,
		],
	});
}

(() => {
	logger = createLogger({ name: 'server' });
})();

export { logger };
