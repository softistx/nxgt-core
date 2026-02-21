export {};

declare module 'hono' {
	interface ContextVariableMap {
		language?: 'en' | 'fr';
	}
}
