import type { defineConfig } from '@hey-api/openapi-ts';
import { importTool } from './compiler-api';

type HeyApiConfig = Parameters<typeof defineConfig>[0];

type Configurer = (config: HeyApiConfig) => HeyApiConfig;

export async function defineHeyApiConfig(configurer?: Configurer) {
	// Loaded here, not at module scope: see compiler-api.ts.
	const { defineConfig } = await importTool(
		'defineHeyApiConfig',
		() => import('@hey-api/openapi-ts'),
	);
	const defaultConfig: HeyApiConfig = {
		input: './openapi/api-docs.yaml',
		output: 'src/generated/openapi-ts',
		plugins: ['zod'],
	};
	return defineConfig(configurer ? configurer(defaultConfig) : defaultConfig);
}
