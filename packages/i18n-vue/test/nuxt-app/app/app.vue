<script setup lang="ts">
const { locale, locales, setLocale } = useI18n();

// `?set=fr` chooses a locale on the server, as a route middleware would.
const set = useRequestURL().searchParams.get('set');
const chosen = locales.find((one) => one === set);
if (chosen !== undefined) setLocale(chosen);
</script>

<template>
	<main>
		<h1>{{ t('home.title') }}</h1>
		<p>{{ t('home.greeting', { name: 'Ada' }) }}</p>
		<p>{{ t('home.items', { count: 2 }) }}</p>
		<p id="locale">{{ locale }}</p>
	</main>
</template>
