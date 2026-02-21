import { defineConfig } from '@hey-api/openapi-ts';

type HeyApiConfig = Parameters<typeof defineConfig>[0];

type Configurer = (config: HeyApiConfig) => HeyApiConfig;

export function defineHeyApiConfig(configurer?: Configurer) {
	const defaultConfig: HeyApiConfig = {
		input: './openapi/api-docs.yaml',
		output: 'src/generated/openapi-ts',
		plugins: ['zod'],
	};
	return defineConfig(configurer ? configurer(defaultConfig) : defaultConfig);
}
