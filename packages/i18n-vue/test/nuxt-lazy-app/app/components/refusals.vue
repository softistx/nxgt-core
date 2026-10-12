<!--
  What the module's generated .nuxt/types/nxgt-i18n-vue.d.ts refuses in a
  Nuxt template with `lazy: true`, at COMPILE time: checked by vue-tsc after
  `nuxt prepare`. setLocale answers a promise, awaited or not.
-->
<script setup lang="ts">
const { setLocale } = useI18n();
await setLocale('de');
// @ts-expect-error — a locale the catalogues do not have.
await setLocale('es');
</script>

<template>
	<p>{{ t('home.greeting', { name: 'Ada' }) }}</p>
	<!-- @vue-expect-error -->
	{{ t('home.titel') }}
</template>
