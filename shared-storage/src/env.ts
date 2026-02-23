import { logger } from '@nxgt/shared/logging';
import { z } from 'zod';

// Define schema
const envSchema = z.object({
	// S3
	S3_ENDPOINT: z.string().default('http://host.docker.internal:9000'),
	S3_USER: z.string().default('minio'),
	S3_PASSWORD: z.string().default('minio123'),
	S3_BUCKET: z.string().default('uploads'),
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
	S3_ENDPOINT: Bun.env.S3_ENDPOINT,
	S3_USER: Bun.env.S3_USER,
	S3_PASSWORD: Bun.env.S3_PASSWORD,
	S3_BUCKET: Bun.env.S3_BUCKET,
});
