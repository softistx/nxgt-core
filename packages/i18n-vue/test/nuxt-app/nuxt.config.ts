// The fixture `src/nuxt/nuxt.spec.ts` builds with `nuxt build` and requests
// on the server it outputs: the module as a consumer installs it, from dist/.
export default defineNuxtConfig({
	compatibilityDate: '2025-07-15',
	modules: ['@nxgt/i18n-vue/nuxt'],
	nxgtI18n: { locales: ['en', 'fr'] },
	telemetry: false,
	devtools: { enabled: false },
});
