import type { YogaInitialContext, YogaServerInstance } from 'graphql-yoga';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { createMiddleware } from 'hono/factory';
import { languageDetector } from 'hono/language';
import { type RenderSandboxOptions, renderSandbox } from '../utils';

export function sandboxExpolorer(options: RenderSandboxOptions) {
	return createMiddleware(async (ctx) => {
		return ctx.html(renderSandbox(options));
	});
}

type HonoYogaOptions = {
	sandbox?: RenderSandboxOptions & { endpoint?: string };
};

export function honoYoga<
	ServerContext extends Partial<YogaInitialContext>,
	UserContext extends {},
>(yoga: YogaServerInstance<ServerContext, UserContext>) {
	return createMiddleware(async (ctx) => {
		const response = await yoga.fetch(ctx.req.raw);

		return response;
	});
}

export function createYogaHono<
	ServerContext extends Partial<YogaInitialContext>,
	UserContext extends {},
>(
	yoga: YogaServerInstance<ServerContext, UserContext>,
	options?: HonoYogaOptions,
) {
	const app = new Hono();

	app.use(contextStorage());
	app.use(
		languageDetector({
			order: ['header'],
			supportedLanguages: ['en', 'fr'],
			fallbackLanguage: 'en',
			caches: [],
		}),
	);

	app.get('/health', (ctx) => {
		return ctx.json({ status: 'ok' }, 200);
	});

	app.get(
		options?.sandbox?.endpoint || 'sandbox',
		sandboxExpolorer(options?.sandbox || {}),
	);

	app.use(yoga.graphqlEndpoint, honoYoga(yoga));

	return app;
}
