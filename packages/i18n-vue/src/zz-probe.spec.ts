import { test } from 'bun:test';
import { ref } from 'vue';
import { setupLazyNuxtI18n } from './nuxt/runtime/index';

const en = { home: { title: 'Welcome' } };
test(`probe full`, async () => {
	const refs: WeakRef<object>[] = [];
	for (let i = 0; i < 50; i++) {
		await (async () => {
			const fresh = { home: { title: 'Willkommen' } };
			refs.push(new WeakRef(fresh));
			await setupLazyNuxtI18n({
				catalogues: { en },
				loaders: { de: async () => fresh },
				locales: ['en', 'de'],
				fallbackLocale: 'en',
				cookie: ref('de'),
				state: ref(undefined),
				catalogue: ref(undefined),
				requested: () => null,
			});
		})();
	}
	Bun.gc(true);
	await new Promise((r) => setTimeout(r, 0));
	Bun.gc(true);
	console.log('full', refs.filter((r) => r.deref()).length);
});
