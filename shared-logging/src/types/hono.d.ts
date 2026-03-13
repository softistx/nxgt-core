import type winston from 'winston';

declare module 'hono' {
	interface ContextVariableMap {
		requestId: string;
		logger: winston.Logger;
	}
}
