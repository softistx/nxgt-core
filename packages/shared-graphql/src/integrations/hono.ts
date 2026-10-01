import type { YogaInitialContext, YogaServerInstance } from 'graphql-yoga';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { createMiddleware } from 'hono/factory';
import { languageDetector } from 'hono/language';
import { type RenderSandboxOptions, renderSandbox } from '../utils/sandbox';

/**
 * Serves Apollo Sandbox. Given neither `port`, `hostname` nor `protocol`, it
 * starts at `graphqlEndpoint` on the server that served the page — the
 * request's own origin, behind a proxy and over HTTPS alike.
 */
export function sandboxExplorer(options: RenderSandboxOptions) {
	const pinned =
		options.port !== undefined ||
		options.hostname !== undefined ||
		options.protocol !== undefined ||
		options.initialEndpoint !== undefined;
	return createMiddleware(async (ctx) => {
		if (pinned) return ctx.html(renderSandbox(options));
		const origin = new URL(ctx.req.url).origin;
		const endpoint = (options.graphqlEndpoint ?? 'graphql').replace(/^\/+/, '');
		return ctx.html(
			renderSandbox({ ...options, initialEndpoint: `${origin}/${endpoint}` }),
		);
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
		sandboxExplorer({
			graphqlEndpoint: yoga.graphqlEndpoint,
			...options?.sandbox,
		}),
	);

	app.use(yoga.graphqlEndpoint, honoYoga(yoga));

	return app;
}
