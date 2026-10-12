import { CustomException } from '@nxgt/shared-exceptions';
import { getLogger } from '@nxgt/shared-logging';
import {
	fetch,
	S3Client,
	type S3FilePresignOptions,
	type S3ListObjectsOptions,
	type S3Options,
} from 'bun';
import type { StorageLocaleKey } from '../i18n';
import { MinioService } from './minio.service';

import { S3_CREDENTIALS, type S3ClientWriteBody } from './s3-credentials';

export { S3_CREDENTIALS, type S3ClientWriteBody } from './s3-credentials';

/** How long the URL `fetch` signs stays valid: it is used at once. */
const FETCH_URL_TTL_SECONDS = 60;

type PresignMethod = NonNullable<S3FilePresignOptions['method']>;

/** The request's method, upper-cased; GET when none is given. */
function presignMethod(method: string | undefined): PresignMethod {
	const upper = (method ?? 'GET').toUpperCase();
	if (['GET', 'HEAD', 'PUT', 'POST', 'DELETE'].includes(upper))
		return upper as PresignMethod;
	throw new TypeError(`StorageService.fetch cannot sign a ${method} request`);
}

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

	presign(key: string, options: S3FilePresignOptions = {}) {
		try {
			return this.s3.presign(key, options);
		} catch (error) {
			throw this.failure(error, 'storage.errors.presign-failed');
		}
	}

	/** @deprecated Use {@link StorageService.presign}; kept for existing callers, removed in the next major. */
	presing(key: string, options: S3FilePresignOptions = {}) {
		return this.presign(key, options);
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
			// A presigned URL, not `s3://<key>`: Bun's `s3://` fetch misses every
			// key with a space, a `%` or a non-ASCII character (a 404 for a file
			// `ensureExists` just found), encoded or not, while the client signs
			// such a key correctly. The URL is signed for this request's method.
			const url = this.s3.presign(input, {
				bucket: bucket ?? this.bucket,
				method: presignMethod(options.method),
				expiresIn: FETCH_URL_TTL_SECONDS,
			});
			return await fetch(url, options);
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
