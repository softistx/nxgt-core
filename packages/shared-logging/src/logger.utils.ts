import { tryGetContext } from 'hono/context-storage';
import { type Logger, logger } from './logger';

export function getLogger(): Logger {
	return (tryGetContext()?.get('logger' as never) ?? logger) as typeof logger;
}
