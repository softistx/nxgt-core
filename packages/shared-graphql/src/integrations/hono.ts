import { LANGUAGE_KEY, registerLanguageSource } from '@nxgt/i18n';
import type { YogaInitialContext, YogaServerInstance } from 'graphql-yoga';
import { Hono } from 'hono';
import { contextStorage, tryGetContext } from 'hono/context-storage';
import { createMiddleware } from 'hono/factory';
import { languageDetector } from 'hono/language';
import { type RenderSandboxOptions, renderSandbox } from '../utils/sandbox';

export function sandboxExplorer(options: RenderSandboxOptions) {
	return createMiddleware(async (ctx) => {
		return ctx.html(renderSandbox(options));
	});
}

/**
 * The Hono request's language, for `@nxgt/i18n`'s `getLanguage()`: the
 * `languageDetector()` below sets it, and the errors this package formats are
 * translated in it.
 *
 * `@nxgt/shared-hono`'s `honoLanguageSource`, kept twice on purpose: this
 * package does not depend on `@nxgt/shared-hono`, and an app may serve Yoga
 * without it. Registered once, whichever registers first; the registry keeps
 * one of each.
 */
const honoLanguage = () => {
	const language: unknown = tryGetContext()?.get(LANGUAGE_KEY as never);
	return typeof language === 'string' ? language : undefined;
};

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

	registerLanguageSource(honoLanguage);
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
		sandboxExplorer(options?.sandbox || {}),
	);

	app.use(yoga.graphqlEndpoint, honoYoga(yoga));

	return app;
}
