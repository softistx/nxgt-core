import { translate } from '@nxgt/i18n';
import { omit, STRINGS_UTILS } from '@nxgt/shared/helpers';
import { getLogger } from '@nxgt/shared/logging';
import { CustomException } from '@nxgt/shared-exceptions';
import {
	fetch,
	S3Client,
	type S3FilePresignOptions,
	type S3ListObjectsOptions,
	type S3Options,
} from 'bun';
import { env } from '../env';
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
		this.minio.ensureBucketExists(bucket);
	}

	async write(key: string, body: S3ClientWriteBody, options: S3Options = {}) {
		try {
			return this.s3.write(key, body, { ...options });
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.write-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	async list(input: S3ListObjectsOptions = {}, options: S3Options = {}) {
		try {
			return this.s3.list(input, options);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.list-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	file(key: string, options: S3Options = {}) {
		try {
			return this.s3.file(key, options);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.file-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	async exists(key: string, options: S3Options = {}) {
		try {
			return this.s3.exists(key, options);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.exists-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	presing(key: string, options: S3FilePresignOptions = {}) {
		try {
			return this.s3.presign(key, options);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.presign-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	async delete(key: string, options: S3Options = {}) {
		try {
			await this.ensureExists(key, options);
			return this.s3.delete(key, options);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.delete-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	async size(key: string, options: S3Options = {}) {
		try {
			await this.ensureExists(key, options);
			return this.s3.size(key, options);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.size-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	async stat(key: string, options: S3Options = {}) {
		try {
			await this.ensureExists(key, options);
			return this.s3.stat(key, options);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.stat-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	async unlink(key: string, options: S3Options = {}) {
		try {
			await this.ensureExists(key, options);
			return this.s3.unlink(key, options);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.unlink-failed',
				debugMessage: (error as Error).message,
			});
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
			await this.ensureExists(input, { bucket });
			return fetch(
				STRINGS_UTILS.normalizeUrl(`s3://${bucket ?? this.bucket}/${input}`),
				{
					...options,
					s3: omit(S3_CREDENTIALS, ['bucket']),
				},
			);
		} catch (error) {
			this.logger.error(error);
			throw CustomException.internal({
				message: 'storage.errors.fetch-failed',
				debugMessage: (error as Error).message,
			});
		}
	}

	private async ensureExists(key: string, options: S3Options = {}) {
		if (!(await this.s3.exists(key, options))) {
			throw CustomException.notFound({
				message: translate('storage.errors.file-not-found', { key }) as any,
			});
		}
	}
}
