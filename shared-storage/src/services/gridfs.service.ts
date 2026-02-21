import { createReadStream } from 'node:fs';
import type { CursorPaginationParams } from '@nxgt/shared/helpers';
import { CustomException } from '@nxgt/shared-exceptions';
import { type mongo, mongoose } from '@nxgt/shared-mongo';
import { ObjectId } from 'bson';
import { pick } from 'lodash';

export type GridFSBucketNames =
	| 'avatars'
	| 'uploads'
	| 'images'
	| 'videos'
	| 'files'
	| string;

export interface IBucketOptions {
	bucketName?: GridFSBucketNames;
	bucket?: mongoose.mongo.GridFSBucket;
}

export class GridFSService {
	uploads: mongoose.mongo.GridFSBucket;
	avatars: mongoose.mongo.GridFSBucket;
	images: mongoose.mongo.GridFSBucket;
	videos: mongoose.mongo.GridFSBucket;
	files: mongoose.mongo.GridFSBucket;

	buckets: Record<GridFSBucketNames, mongoose.mongo.GridFSBucket>;

	constructor() {
		if (!mongoose.connection.db) {
			throw new Error('Database connection not established');
		}
		this.uploads = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
			bucketName: 'uploads',
		});
		this.avatars = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
			bucketName: 'avatars',
		});
		this.images = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
			bucketName: 'images',
		});
		this.videos = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
			bucketName: 'videos',
		});
		this.files = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
			bucketName: 'files',
		});

		this.buckets = {
			avatars: this.avatars,
			uploads: this.uploads,
			images: this.images,
			videos: this.videos,
			files: this.files,
		};
	}

	async paginate(
		filter?: mongoose.mongo.Filter<mongoose.mongo.GridFSFile>,
		options?: CursorPaginationParams & IBucketOptions,
	) {
		const after = options?.after;
		const before = options?.before;

		// Validate first and last
		const first =
			options?.first && options.first > 0 ? options.first : undefined;
		const last = options?.last && options.last > 0 ? options.last : undefined;

		if (first && last) {
			throw CustomException.badRequest({
				message: 'errors.could-not-use-first-and-last-together',
			});
		}

		// Build cursor filter
		const cursorFilter: mongoose.mongo.Filter<mongoose.mongo.GridFSFile> = {
			...filter,
		};

		if (after) {
			cursorFilter._id = {
				...(cursorFilter._id ?? {}),
				$gt: new ObjectId(after),
			};
		}

		if (before) {
			cursorFilter._id = {
				...(cursorFilter._id ?? {}),
				$lt: new ObjectId(before),
			};
		}

		// Determine limit and sort order
		const hasLimit = !!(first || last);
		const limit = hasLimit ? ((first ?? last) as number) : undefined;
		const querySort: { _id: 1 | -1 } = last ? { _id: -1 } : { _id: 1 };

		// Build query
		const bucket = this.bucket(options);
		const query = bucket.find(cursorFilter).sort(querySort);

		// Apply limit only if specified (fetch one extra to determine if there are more pages)
		if (hasLimit) {
			query.limit(Math.max(limit || 0, 1) + 1);
		}

		const docs = await query.toArray();

		// If using 'last', reverse the results back to normal order
		const hasExtraDoc = hasLimit && docs.length > (limit as number);
		const resultDocs = hasExtraDoc ? docs.slice(0, limit) : docs;
		if (last) {
			resultDocs.reverse();
		}

		// Get total count
		const totalElements = await bucket.find(filter ?? {}).count();

		// Determine cursors and page info
		const startCursor =
			resultDocs.length > 0 ? resultDocs?.[0]?._id.toString() : null;
		const endCursor =
			resultDocs.length > 0
				? resultDocs?.[resultDocs.length - 1]?._id.toString()
				: null;

		let hasNextPage = false;
		let hasPreviousPage = false;

		if (first) {
			hasNextPage = hasExtraDoc;
			hasPreviousPage = !!after;
		} else if (last) {
			hasNextPage = !!before;
			hasPreviousPage = hasExtraDoc;
		}

		return {
			data: resultDocs,
			metadata: {
				startCursor,
				endCursor,
				hasNextPage,
				hasPreviousPage,
				totalElements,
			},
		};
	}

	async findById(
		id: string,
		options?: IBucketOptions,
	): Promise<mongoose.mongo.GridFSFile | null> {
		return this.bucket(options)
			.find({ _id: new mongoose.mongo.ObjectId(id) })
			.limit(1)
			.tryNext();
	}

	async find(
		filter?: mongoose.mongo.Filter<mongoose.mongo.GridFSFile>,
		options?: mongoose.mongo.FindOptions & IBucketOptions,
	) {
		return this.bucket(pick(options, ['bucketName', 'bucket']))
			.find(filter, options)
			.toArray();
	}

	async delete(id: string, options?: IBucketOptions): Promise<void> {
		await this.bucket(options).delete(new mongoose.mongo.ObjectId(id));
	}

	async download(
		id: string,
		{ user, ...options }: IBucketOptions & { user?: string } = {},
	) {
		const gridFSFile = await this.findById(id, options);
		if (!gridFSFile) {
			throw CustomException.notFound({
				message: 'files.errors.file-not-found',
			});
		}
		if (mongoose.connection.db) {
			await mongoose.connection.db
				.collection(`${options.bucketName ?? 'uploads'}.files`)
				.findOneAndUpdate(
					{ _id: new mongoose.mongo.ObjectId(id) },
					{
						$set: {
							'metadata.lastOpenedBy': user,
							'metadata.lastOpenedDate': new Date(),
						},
					},
				);
		}
		return this.bucket(options).openDownloadStream(
			new mongoose.mongo.ObjectId(id),
		);
	}

	async rename(
		id: string,
		name: string,
		{ user, ...options }: IBucketOptions & { user?: string } = {},
	): Promise<mongo.GridFSFile> {
		const gridFSFile = await this.findById(id, options);
		if (!gridFSFile) {
			throw CustomException.notFound({
				message: 'files.errors.file-not-found',
			});
		}
		await this.bucket(options).rename(new mongoose.mongo.ObjectId(id), name);
		if (mongoose.connection.db) {
			await mongoose.connection.db
				.collection(`${options.bucketName ?? 'uploads'}.files`)
				.findOneAndUpdate(
					{ _id: new mongoose.mongo.ObjectId(id) },
					{
						$set: {
							'metadata.lastModifiedBy': user,
							'metadata.lastModifiedDate': new Date(),
						},
					},
				);
		}
		const result = await this.findById(id, options);
		if (!result) {
			throw CustomException.notFound({
				message: 'files.errors.file-not-found-after-rename',
			});
		}
		return result;
	}

	async upload(file: File, options?: IBucketOptions & { metadata?: object }) {
		const fileId = new ObjectId();

		const filePath = `uploads/tmp/${fileId.toHexString()}-${file.name}`;

		await Bun.write(filePath, file);

		const uploaded = Bun.file(filePath);

		const metadata = {
			...(options?.metadata ?? {}),
			contentType: uploaded.type,
			mimetype: uploaded.type,
			category: this.resolveFileTypeCategory(uploaded.type),
		};

		const stream = this.bucket(options).openUploadStream(file.name, {
			id: fileId as any,
			metadata,
		});

		createReadStream(filePath).pipe(stream);

		return new Promise<ObjectId>((resolve, reject) => {
			stream.on('finish', () => {
				uploaded.delete();
				resolve(fileId);
			});
			stream.on('error', () => {
				uploaded.delete();
				reject();
			});
		});
	}

	private bucket(options?: IBucketOptions) {
		if (!mongoose.connection.db) {
			throw new Error('Database connection not established');
		}
		return (
			options?.bucket ??
			(options?.bucketName
				? (this.buckets[options.bucketName] ??
					new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
						bucketName: options.bucketName,
					}))
				: this.uploads)
		);
	}

	/**
	 * Determines the category for a given file MIME type.
	 * This is a private helper method.
	 * @param mimetype The MIME type of the file.
	 * @returns A string representing the file type category (e.g., 'images', 'documents', 'other').
	 */
	private resolveFileTypeCategory(mimetype: string): string {
		if (mimetype.startsWith('image/')) {
			return 'images';
		}
		if (mimetype.startsWith('video/')) {
			return 'videos';
		}
		if (mimetype.startsWith('audio/')) {
			return 'audio';
		}
		if (
			mimetype.startsWith('text/') ||
			mimetype === 'application/pdf' ||
			mimetype === 'application/msword' ||
			mimetype ===
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
			mimetype === 'application/vnd.ms-excel' ||
			mimetype ===
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
			mimetype === 'application/vnd.ms-powerpoint' ||
			mimetype ===
				'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
			mimetype === 'application/vnd.oasis.opendocument.text' ||
			mimetype === 'application/vnd.oasis.opendocument.spreadsheet' ||
			mimetype === 'application/vnd.oasis.opendocument.presentation' ||
			mimetype === 'application/rtf'
		) {
			return 'documents';
		}
		return 'others';
	}
}
