// The fixture `src/nuxt/nuxt-lazy.spec.ts` builds with `nuxt build` and
// requests on the server it outputs: the module with `lazy: true`, every
// locale but `en` a chunk of its own.
export default defineNuxtConfig({
	compatibilityDate: '2025-07-15',
	modules: ['@nxgt/i18n-vue/nuxt'],
	nxgtI18n: { locales: ['en', 'fr', 'de'], lazy: true },
	telemetry: false,
	devtools: { enabled: false },
});
