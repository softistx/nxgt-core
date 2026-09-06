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

	const customFormat = printf(({ level, message, label, timestamp }) => {
		return `[${timestamp}] [${label}] [${level}] ${message}`;
	});

	const fileRotateTransport = new winston.transports.DailyRotateFile({
		filename: `logs/${options.name}-%DATE%.log`,
		datePattern: 'YYYY-MM-DD',
		maxFiles: '14d',
	});

	return winston.createLogger({
		level: Bun.env.LOG_LEVEL || 'info',
		format: combine(
			colorize({ all: true }),
			label({ label: options.tag ?? 'sellix' }),
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
