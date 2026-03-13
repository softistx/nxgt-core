import { logger } from '@nxgt/shared-logging';
import { z } from 'zod';

// Define schema
const envSchema = z.object({
	// Node environment
	NODE_ENV: z
		.enum(['development', 'production', 'test'])
		.default('development'),

	// Server
	PORT: z.coerce.number().default(8080),

	// Logging
	LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('debug'),
});

export type Env = z.infer<typeof envSchema>;

// Parse and validate environment variables
const parseEnv = (value: Record<string, unknown>): Env => {
	const result = envSchema.safeParse(value);

	if (!result.success) {
		logger.error('❌ Invalid environment variables:');
		logger.error(result.error.issues);
		throw new Error('Invalid environment variables');
	}

	return result.data;
};

// Export validated and typed environment variables
export const env = parseEnv({
	NODE_ENV: Bun.env.NODE_ENV,
	PORT: Bun.env.PORT,
});
