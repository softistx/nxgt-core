import type { S3Client } from 'bun';
import { env } from '../env';

/**
 * The connection both services read, in its own module so that
 * `minio.service.ts` and `storage.service.ts` do not import each other.
 * `storage.service.ts` re-exports it, which is where consumers import it from.
 */
export const S3_CREDENTIALS = {
	endpoint: env.S3_ENDPOINT,
	bucket: env.S3_BUCKET,
	accessKeyId: env.S3_USER,
	secretAccessKey: env.S3_PASSWORD,
};

export type S3ClientWriteBody = Parameters<S3Client['write']>[1];
