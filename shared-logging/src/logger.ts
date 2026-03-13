import winston, { format } from 'winston';
import 'winston-daily-rotate-file';

let logger: winston.Logger;

export function createLogger(options: {
	tag?: string;
	name: string;
	disableConsole?: boolean;
}) {
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
