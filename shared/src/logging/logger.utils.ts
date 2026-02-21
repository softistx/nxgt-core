import { tryGetContext } from 'hono/context-storage';
import { logger } from './logger';

export function getLogger() {
	return (tryGetContext()?.get('logger' as never) ?? logger) as typeof logger;
}
