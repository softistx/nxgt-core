<!--
  What the generated types refuse in a Vue template, at COMPILE time:
  checked by `bun run typecheck:types` (vue-tsc), never built. Each
  @vue-expect-error stops holding the moment the directive goes unused. The
  calls that must keep compiling are here too, unmarked.

  Seven plausible mistakes, seven refused.
-->
<script setup lang="ts">
import { type MessageKey, useI18n } from '@nxgt/i18n-vue';

const { locale, setLocale } = useI18n();
// A key that may be any message: checked when t runs.
const key = 'home.greeting' as MessageKey;
</script>

<template>
	<!-- Must keep compiling. -->
	<h1 :lang="locale">{{ t('home.title') }}</h1>
	<p>{{ t('home.greeting', { name: 'Ada' }) }}</p>
	<p>{{ t('home.items', { count: 2 }) }}</p>
	<p>{{ t('home.sentOn', { at: new Date(0) }) }}</p>
	<p>{{ t('home.sent-on', { at: new Date(0) }) }}</p>
	<p>{{ t(locale === 'fr' ? 'home.title' : 'home.action') }}</p>
	<p>{{ t(key, { name: 'Ada' }) }}</p>
	<button type="button" @click="setLocale('fr')">fr</button>

	<!-- 1. A key the catalogues do not have. -->
	<!-- @vue-expect-error -->
	{{ t('home.titel') }}

	<!-- 2. A message's argument left out. -->
	<!-- @vue-expect-error -->
	{{ t('home.greeting') }}

	<!-- 3. An argument the message does not use. -->
	<!-- @vue-expect-error -->
	{{ t('home.title', { name: 'Ada' }) }}

	<!-- 4. A plural's count given as text. -->
	<!-- @vue-expect-error -->
	{{ t('home.items', { count: '2' }) }}

	<!-- 5. A key written in snake_case: every key is camelCase. -->
	<!-- @vue-expect-error -->
	{{ t('home.sent_on', { at: 0 }) }}

	<!-- 6. A key that may be a message without arguments or one with. -->
	<!-- @vue-expect-error -->
	{{ t(locale === 'fr' ? 'home.title' : 'home.items') }}

	<!-- 7. A locale the catalogues do not have. -->
	<!-- @vue-expect-error -->
	<button type="button" @click="setLocale('de')">de</button>
</template>
