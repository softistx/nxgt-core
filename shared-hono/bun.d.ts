declare module 'bun' {
	interface Env {
		/** Node environment */
		NODE_ENV: 'development' | 'production' | 'test';

		/** Server */
		PORT: string;

		/** Logging */
		LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
	}
}
