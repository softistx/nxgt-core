import type { LocaleKey } from '@nxgt/i18n';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { env } from '../env';

export type ErrorHandlerOptions = {
	showStackInDev?: boolean;
	showStackInTest?: boolean;
	logToConsole?: boolean;
};

export const createErrorHandler = <K extends LocaleKey = LocaleKey>(
	translate: (key: K, context?: Record<string, any>) => string,
	{
		showStackInDev = true,
		showStackInTest = false,
		logToConsole = true,
	}: ErrorHandlerOptions = {},
): ErrorHandler => {
	return (err, c) => {
		if (logToConsole) {
			logger.error('─'.repeat(60));
			logger.error('[Global Error]', err);
			if (
				(showStackInDev && env.NODE_ENV === 'development') ||
				(showStackInTest && env.NODE_ENV === 'test')
			) {
				logger.error(err.stack);
			}
			logger.error('─'.repeat(60));
		}

		if (err instanceof CustomException) {
			c.status(err.code);
			return c.json({
				status: err.code,
				message: translate(err.message as K, err.options),
				debugMessage: err.debugMessage,
				timestamp: new Date(),
			});
		}
		if (err instanceof HTTPException) {
			c.status(err.status);
			return c.json({
				status: err.status,
				message: err.message,
				debugMessage: err.stack,
				timestamp: new Date(),
			});
		}
		c.status(500);
		return c.json({
			status: 500,
			message: translate('errors.internal-server-error' as K),
			debugMessage: err.message,
			timestamp: new Date(),
		});
	};
};
