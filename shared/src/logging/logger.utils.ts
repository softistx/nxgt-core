import { tryGetContext } from 'hono/context-storage';
import { logger } from './logger';

export function getLogger() {
	return (tryGetContext()?.get('logger' as any) ?? logger) as typeof logger;
}
