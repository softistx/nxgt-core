import { STRINGS_UTILS } from '@nxgt/shared/helpers';
import { CustomException } from '@nxgt/shared-exceptions';
import { getLogger } from '@nxgt/shared-logging';
import {
	fetch,
	S3Client,
	type S3FilePresignOptions,
	type S3ListObjectsOptions,
	type S3Options,
} from 'bun';
import { env } from '../env';
import type { StorageLocaleKey } from '../i18n';
import { MinioService } from './minio.service';

export const S3_CREDENTIALS = {
	endpoint: env.S3_ENDPOINT,
	bucket: env.S3_BUCKET,
	accessKeyId: env.S3_USER,
	secretAccessKey: env.S3_PASSWORD,
};

export type S3ClientWriteBody = Parameters<S3Client['write']>[1];

export class StorageService {
	s3: S3Client;
	private bucket: string;
	private logger = getLogger();
	minio: MinioService;

	constructor(bucket?: string) {
		this.bucket = bucket ?? S3_CREDENTIALS.bucket;
		this.s3 = new S3Client({
			...S3_CREDENTIALS,
			bucket: this.bucket,
		});
		this.minio = new MinioService(bucket);
		// Unawaited on purpose — the constructor cannot block — but an
		// unhandled rejection here would take the process down.
		this.minio.ensureBucketExists(bucket).catch((error) => {
			this.logger.error(error);
		});
	}

	async write(key: string, body: S3ClientWriteBody, options: S3Options = {}) {
		try {
			return await this.s3.write(key, body, { ...options });
		} catch (error) {
			throw this.failure(error, 'storage.errors.write-failed');
		}
	}

	async list(input: S3ListObjectsOptions = {}, options: S3Options = {}) {
		try {
			return await this.s3.list(input, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.list-failed');
		}
	}

	file(key: string, options: S3Options = {}) {
		try {
			return this.s3.file(key, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.file-failed');
		}
	}

	async exists(key: string, options: S3Options = {}) {
		try {
			return await this.s3.exists(key, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.exists-failed');
		}
	}

	presing(key: string, options: S3FilePresignOptions = {}) {
		try {
			return this.s3.presign(key, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.presign-failed');
		}
	}

	async delete(key: string, options: S3Options = {}) {
		try {
			await this.ensureExists(key, options);
			return await this.s3.delete(key, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.delete-failed');
		}
	}

	async size(key: string, options: S3Options = {}) {
		try {
			await this.ensureExists(key, options);
			return await this.s3.size(key, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.size-failed');
		}
	}

	async stat(key: string, options: S3Options = {}) {
		try {
			await this.ensureExists(key, options);
			return await this.s3.stat(key, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.stat-failed');
		}
	}

	async unlink(key: string, options: S3Options = {}) {
		try {
			await this.ensureExists(key, options);
			return await this.s3.unlink(key, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.unlink-failed');
		}
	}

	async fetch(
		input: string,
		{
			bucket,
			...options
		}: BunFetchRequestInit & Pick<S3Options, 'bucket'> = {},
	) {
		try {
			await this.ensureExists(input, bucket === undefined ? {} : { bucket });
			// The bucket goes in the options, never in the URL: Bun reads
			// `S3_BUCKET` from the environment as the default bucket and then
			// takes the whole `s3://` path as the key, so `s3://<bucket>/<key>`
			// requested `/<S3_BUCKET>/<bucket>/<key>` — a 404 for every file.
			return await fetch(STRINGS_UTILS.normalizeUrl(`s3://${input}`), {
				...options,
				s3: { ...S3_CREDENTIALS, bucket: bucket ?? this.bucket },
			});
		} catch (error) {
			throw this.failure(error, 'storage.errors.fetch-failed');
		}
	}

	/**
	 * A missing key is a 404 the caller can act on. The message is the key,
	 * not its text: whoever renders the exception (`shared-hono`'s error
	 * handler, `shared-graphql`'s) translates `message` with `options`, so
	 * text here would be translated a second time.
	 */
	private async ensureExists(key: string, options: S3Options = {}) {
		if (!(await this.s3.exists(key, options))) {
			throw CustomException.notFound<StorageLocaleKey>({
				message: 'storage.errors.file-not-found',
				options: { key },
			});
		}
	}

	/**
	 * What a method's `catch` throws. A `CustomException` — the 404 from
	 * {@link ensureExists} — already says what went wrong and passes through
	 * unchanged; anything else is an SDK error, logged and wrapped in a 500
	 * carrying the method's own message key.
	 */
	private failure(error: unknown, message: StorageLocaleKey): CustomException {
		if (error instanceof CustomException) {
			return error;
		}
		this.logger.error(error);
		return CustomException.internal<StorageLocaleKey>({
			message,
			debugMessage: error instanceof Error ? error.message : String(error),
		});
	}
}
