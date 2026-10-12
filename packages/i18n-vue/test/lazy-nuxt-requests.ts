/**
 * A server's worth of requests through `setupLazyNuxtI18n`, each with a
 * loader that answers a new catalogue object — as one that fetches does —
 * then a full garbage collection. Prints how many of those catalogues are
 * still alive. Run by `src/nuxt/runtime/runtime.spec.ts` in a process of its
 * own: in the test runner's shared process, what the other spec files left
 * behind makes the collector keep objects it would otherwise free.
 */

import { ref } from 'vue';
import type { Catalogue } from '../src/core/catalogues';
import { setupLazyNuxtI18n } from '../src/nuxt/runtime/index';

const requests = Number(process.argv[2] ?? 50);
const en = { home: { title: 'Welcome' } };
const refs: WeakRef<object>[] = [];

async function serve(): Promise<string> {
	const fresh = { home: { title: 'Willkommen' } };
	refs.push(new WeakRef(fresh));
	const i18n = await setupLazyNuxtI18n({
		catalogues: { en },
		loaders: { de: async () => fresh },
		locales: ['en', 'de'],
		fallbackLocale: 'en',
		cookie: ref<string | null | undefined>('de'),
		state: ref<string | undefined>(),
		catalogue: ref<Catalogue | null | undefined>(),
		requested: () => null,
	});
	return i18n.t('home.title');
}

for (let i = 0; i < requests; i++) await serve();
Bun.gc(true);
await new Promise((resolve) => setTimeout(resolve, 0));
Bun.gc(true);
console.log(
	JSON.stringify({ requests, alive: refs.filter((r) => r.deref()).length }),
);
