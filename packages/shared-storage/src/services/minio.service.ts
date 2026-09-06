import { getLogger } from '@nxgt/shared-logging';
import { Archive } from 'bun';
import {
	Client,
	CopyDestinationOptions,
	CopySourceOptions,
	type ICopyDestinationOptions,
	type ICopySourceOptions,
	type ItemBucketMetadata,
	type RemoveOptions,
} from 'minio';

// Not re-exported from the `minio` package root (only from its internal
// type module), so mirrored here from its actual shape.
type PreSignRequestParams = Record<string, string>;

// Same problem, one step further: these result shapes are only reachable
// through minio's internal type module, so an inferred return type makes `tsc`
// write `node_modules/minio/dist/main/internal/type` into the emitted `.d.ts`
// and fail with TS2883 — that path does not exist for a consumer installing
// from the registry. Naming them through the public `Client` keeps the
// reference on minio's entry point instead of duplicating the shapes.
type PutObjectResult = Awaited<ReturnType<Client['putObject']>>;
type CopyObjectResult = Awaited<ReturnType<Client['copyObject']>>;
type ListObjectsResult = ReturnType<Client['listObjects']>;

import { S3_CREDENTIALS, type S3ClientWriteBody } from './storage.service';

export type MinioPutBody = Parameters<Client['putObject']>[2];
export type GetObjectOptions = Parameters<Client['getObject']>[2];
export type ListObjectQueryOptions = Parameters<Client['listObjects']>[3];

export class MinioService {
	minio: Client;
	private bucket: string;

	private logger = getLogger();

	constructor(bucket?: string) {
		this.bucket = bucket ?? S3_CREDENTIALS.bucket;
		this.minio = new Client({
			endPoint: S3_CREDENTIALS.endpoint
				.replace(/https?:\/\//, '')
				.replace(/:.*/, ''),
			accessKey: S3_CREDENTIALS.accessKeyId,
			secretKey: S3_CREDENTIALS.secretAccessKey,
			useSSL: S3_CREDENTIALS.endpoint?.startsWith('https'),
			port: S3_CREDENTIALS.endpoint
				? parseInt(S3_CREDENTIALS.endpoint.split(':').pop() || '9000', 10)
				: 9000,
		});
	}

	async ensureBucketExists(bucket?: string) {
		const exists = await this.bucketExists(bucket);
		if (!exists) {
			await this.makeBucket(bucket);
		}
	}

	async convert(body: S3ClientWriteBody): Promise<MinioPutBody> {
		if (
			body instanceof Blob ||
			body instanceof File ||
			body instanceof Response ||
			body instanceof Request
		) {
			const arrayBuffer = await body.arrayBuffer();
			return Buffer.from(arrayBuffer);
		}
		if (body instanceof Archive) {
			const arrayBuffer = await (await body.blob()).arrayBuffer();
			return Buffer.from(arrayBuffer);
		}
		if (body instanceof ArrayBuffer || body instanceof SharedArrayBuffer) {
			return Buffer.from(body);
		}
		if (typeof body === 'string' || body instanceof Buffer) {
			return body;
		}
		return Buffer.from(
			body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
		);
	}

	async putObject(
		key: string,
		body: MinioPutBody,
		size?: number,
		metadata: ItemBucketMetadata = {},
	): Promise<PutObjectResult> {
		this.logger.info(`Putting object ${key} to bucket ${this.bucket}`);
		return this.minio.putObject(this.bucket, key, body, size, metadata);
	}

	async getObject(key: string, options: GetObjectOptions = {}) {
		this.logger.info(`Getting object ${key} from bucket ${this.bucket}`);
		return this.minio.getObject(this.bucket, key, options);
	}

	async fPutObject(
		key: string,
		filePath: string,
		metadata: ItemBucketMetadata = {},
	): Promise<PutObjectResult> {
		this.logger.info(
			`Putting file ${filePath} as object ${key} to bucket ${this.bucket}`,
		);
		return this.minio.fPutObject(this.bucket, key, filePath, metadata);
	}

	async fGetObject(
		key: string,
		filePath: string,
		options: GetObjectOptions = {},
	) {
		this.logger.info(
			`Getting object ${key} from bucket ${this.bucket} to file ${filePath}`,
		);
		return this.minio.fGetObject(this.bucket, key, filePath, options);
	}

	async findUploadId(key: string) {
		this.logger.info(
			`Finding upload ID for object ${key} in bucket ${this.bucket}`,
		);
		return this.minio.findUploadId(this.bucket, key);
	}

	async copyObject(
		source: Omit<ICopySourceOptions, 'Bucket'> & { Bucket?: string },
		destination: Omit<ICopyDestinationOptions, 'Bucket'> & { Bucket?: string },
	): Promise<CopyObjectResult> {
		this.logger.info(
			`Copying object from ${source.Object} to ${destination.Object} in bucket ${this.bucket}`,
		);
		return this.minio.copyObject(
			new CopySourceOptions({
				...source,
				Bucket: source.Bucket ?? this.bucket,
			}),
			new CopyDestinationOptions({
				...destination,
				Bucket: destination.Bucket ?? this.bucket,
			}),
		);
	}

	async deleteObject(key: string, options?: RemoveOptions) {
		this.logger.info(`Deleting object ${key} from bucket ${this.bucket}`);
		return this.minio.removeObject(this.bucket, key, options);
	}

	async listObjects(
		prefix: string = '',
		recursive: boolean = false,
		options?: ListObjectQueryOptions,
	): Promise<ListObjectsResult> {
		this.logger.info(
			`Listing objects in bucket ${this.bucket} with prefix ${prefix} and recursive ${recursive}`,
		);
		return this.minio.listObjects(this.bucket, prefix, recursive, options);
	}

	async listObjectsV2(
		prefix: string = '',
		recursive: boolean = false,
		startAfter?: string,
	) {
		this.logger.info(
			`Listing objects (V2) in bucket ${this.bucket} with prefix ${prefix} and recursive ${recursive}`,
		);
		return this.minio.listObjectsV2(this.bucket, prefix, recursive, startAfter);
	}

	/**
	 * Presigned GET URL supporting response-header overrides (e.g.
	 * `response-content-disposition`) — Bun's native `S3Client.presign()`
	 * (used by `StorageService.presing()`) has no equivalent, so callers that
	 * need per-request Content-Disposition/Content-Type overrides (attachment
	 * vs inline downloads) must go through this instead.
	 */
	async presignedGetObject(
		key: string,
		expiresIn = 7 * 24 * 60 * 60,
		respHeaders: PreSignRequestParams = {},
	) {
		this.logger.info(
			`Presigning GET for object ${key} in bucket ${this.bucket}`,
		);
		return this.minio.presignedGetObject(
			this.bucket,
			key,
			expiresIn,
			respHeaders,
		);
	}

	async presignedPutObject(key: string, expiresIn = 7 * 24 * 60 * 60) {
		this.logger.info(
			`Presigning PUT for object ${key} in bucket ${this.bucket}`,
		);
		return this.minio.presignedPutObject(this.bucket, key, expiresIn);
	}

	async bucketExists(bucket?: string) {
		this.logger.info(`Checking if bucket ${bucket ?? this.bucket} exists`);
		return this.minio.bucketExists(bucket ?? this.bucket);
	}

	async makeBucket(bucket?: string) {
		this.logger.info(`Creating bucket ${bucket ?? this.bucket}`);
		return this.minio.makeBucket(bucket ?? this.bucket);
	}
}
