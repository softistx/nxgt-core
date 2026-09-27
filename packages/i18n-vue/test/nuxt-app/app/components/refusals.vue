<!--
  What the module's generated .nuxt/types/nxgt-i18n-vue.d.ts refuses in a
  Nuxt template, at COMPILE time: checked by vue-tsc after `nuxt prepare`.
-->
<script setup lang="ts">
const { setLocale } = useI18n();
setLocale('fr');
// @ts-expect-error — a locale the catalogues do not have.
setLocale('de');
</script>

<template>
	<p>{{ t('home.greeting', { name: 'Ada' }) }}</p>
	<!-- @vue-expect-error -->
	{{ t('home.titel') }}
	<!-- @vue-expect-error -->
	{{ t('home.greeting') }}
</template>
