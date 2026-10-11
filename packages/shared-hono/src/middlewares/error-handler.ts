import type { LocaleKey } from '@nxgt/i18n';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { rawEnv } from '../env';

export type ErrorHandlerOptions = {
	/** Log the stack under `NODE_ENV=development`. Defaults to `true`. */
	showStackInDev?: boolean;
	/** Log the stack under `NODE_ENV=test`. Defaults to `false`. */
	showStackInTest?: boolean;
	/**
	 * Log every error. Defaults to `true`. Under `NODE_ENV=production` the
	 * stack and a `CustomException`'s `debugMessage` are always logged (also
	 * when `NODE_ENV` is unset), since the response no longer carries them;
	 * `false` logs nothing at all.
	 */
	logToConsole?: boolean;
};

/**
 * The `app.onError` handler: a `CustomException` answers its code and its
 * translated message, an `HTTPException` its status and message, anything
 * else 500 and `errors.internal-server-error`.
 *
 * Under `NODE_ENV=development` and `test` the body also carries a
 * `debugMessage` — the exception's own, the `HTTPException`'s stack, or the
 * error's message. Under any other `NODE_ENV` — `production`, or unset — it
 * does not: that detail goes to the logger only. The check reads the raw
 * `NODE_ENV` (`rawEnv`), not the parsed `env` that defaults an unset value to
 * `development`, so a service deployed without `NODE_ENV` is secure by default.
 */
export const createErrorHandler = <K extends LocaleKey = LocaleKey>(
	translate: (key: K, context?: Record<string, any>) => string,
	{
		showStackInDev = true,
		showStackInTest = false,
		logToConsole = true,
	}: ErrorHandlerOptions = {},
): ErrorHandler => {
	return (err, c) => {
		// Detail only when NODE_ENV is explicitly development or test; an unset
		// or any other value answers as production does.
		const nodeEnv = rawEnv.NODE_ENV;
		const detailed = nodeEnv === 'development' || nodeEnv === 'test';

		if (logToConsole) {
			logger.error('─'.repeat(60));
			logger.error('[Global Error]', err);
			if (
				!detailed &&
				err instanceof CustomException &&
				err.debugMessage != null
			) {
				logger.error(`[Global Error] debugMessage: ${err.debugMessage}`);
			}
			if (
				!detailed ||
				(showStackInDev && nodeEnv === 'development') ||
				(showStackInTest && nodeEnv === 'test')
			) {
				logger.error(err.stack);
			}
			logger.error('─'.repeat(60));
		}

		const debug = (debugMessage: string | null | undefined) =>
			detailed ? { debugMessage } : {};

		if (err instanceof CustomException) {
			c.status(err.code);
			return c.json({
				status: err.code,
				message: translate(err.message as K, err.options),
				...debug(err.debugMessage),
				timestamp: new Date(),
			});
		}
		if (err instanceof HTTPException) {
			c.status(err.status);
			return c.json({
				status: err.status,
				message: err.message,
				...debug(err.stack),
				timestamp: new Date(),
			});
		}
		c.status(500);
		return c.json({
			status: 500,
			message: translate('errors.internal-server-error' as K),
			...debug(err.message),
			timestamp: new Date(),
		});
	};
};
