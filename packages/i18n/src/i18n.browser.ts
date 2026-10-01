/**
 * The `browser` condition's build of `./i18n`. They were two files while
 * `./i18n` imported `hono/context-storage`, which pulls in `node:async_hooks`;
 * since 2.0 neither imports anything Node-only, and a browser registers its
 * own language sources as a server does. The entry point stays, so a bundler
 * that resolves the `browser` condition keeps resolving it.
 */
export * from './i18n';
