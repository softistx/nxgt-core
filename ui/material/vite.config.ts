import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		tailwindcss(),
		react(),
		dts({
			rollupTypes: true,
			exclude: ['src', '**/*.stories.tsx'],
			tsconfigPath: 'tsconfig.lib.json',
		}),
	],
	assetsInclude: ['**/*.pdf'],
	test: {
		environment: 'node',
	},
	build: {
		copyPublicDir: false,
		lib: {
			fileName: 'main',
			entry: resolve(__dirname, 'lib/main.ts'),
			formats: ['es'],
		},
		rollupOptions: {
			external: ['react', 'react-dom', "**/*.stories.tsx'"],
			output: {
				globals: {
					react: 'React',
					'react-dom': 'ReactDOM',
				},
			},
		},
	},
});
