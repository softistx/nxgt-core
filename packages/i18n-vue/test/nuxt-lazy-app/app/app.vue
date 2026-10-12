<script setup lang="ts">
const { locale, locales, setLocale } = useI18n();

// `?set=de` chooses a locale on the server, as a route middleware would: a
// locale loaded on demand is switched to once its catalogue is loaded.
const set = useRequestURL().searchParams.get('set');
const chosen = locales.find((one) => one === set);
if (chosen !== undefined) await setLocale(chosen);
</script>

<template>
	<main>
		<h1>{{ t('home.title') }}</h1>
		<p>{{ t('home.greeting', { name: 'Ada' }) }}</p>
		<p>{{ t('extra.title') }}</p>
		<p id="locale">{{ locale }}</p>
		<button v-for="one in locales" :key="one" type="button" @click="setLocale(one)">
			{{ one }}
		</button>
	</main>
</template>
