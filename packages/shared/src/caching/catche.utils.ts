import { getContext } from 'hono/context-storage';
import { get } from 'lodash';
import { hexaHash } from '../helpers';

export function getLastModifiedDate<T extends object>(
	value: T,
	prefix?: string,
): Date {
	const date = new Date(
		(getField(value, 'lastModifiedDate', prefix) as any) ?? null,
	);
	if (date instanceof Date && !Number.isNaN(date.getTime())) {
		return date;
	}
	return new Date();
}

export function extractLastModifiedDateFromList(
	data: any,
	prefix?: string,
): Date {
	if (!Array.isArray(data) || data.length === 0) {
		return new Date();
	}
	const latestModified = data.reduce(
		(latest, item) => {
			const itemDate = getLastModifiedDate(item, prefix);
			return itemDate > latest ? itemDate : latest;
		},
		getLastModifiedDate(data[0], prefix),
	);

	return latestModified;
}

export function getField<T extends object>(
	value: T,
	fieldName: string,
	prefix?: string,
) {
	return get(value, prefix ? `${prefix}.${fieldName}` : fieldName);
}

export function checkEntityForCaching<T extends object>(
	entity: T,
	dateFieldPrefix?: string,
	eTag?: string,
) {
	const context = getContext();
	if (eTag) {
		context.header('ETag', eTag);
		const ifNoneMatch = context.req.header('If-None-Match');
		if (ifNoneMatch === eTag) {
			context.status(304);
			context.json(null);
			return;
		}
	} else {
		const lastModified = getLastModifiedDate<T>(entity, dateFieldPrefix);
		const ifModifiedSinceHeader = context.req.header('If-Modified-Since');
		if (ifModifiedSinceHeader) {
			const ifModifiedSinceDate = new Date(ifModifiedSinceHeader);
			if (!Number.isNaN(ifModifiedSinceDate.getTime())) {
				if (lastModified.getTime() <= ifModifiedSinceDate.getTime()) {
					context.status(304);
					context.json(null);
					return;
				}
			}
		}
		context.header('Last-Modified', lastModified.toUTCString());
	}
}

export function checkListForCaching<T extends object>(
	list: T[],
	prefix?: string,
	eTag?: string,
) {
	const context = getContext();
	if (list.length === 0) {
		if (eTag) {
			context.header('ETag', eTag);
			const ifNoneMatch = context.req.header('If-None-Match');
			if (ifNoneMatch === eTag) {
				context.status(304);
				context.json(null);
				return;
			}
		} else {
			context.header('Last-Modified', new Date().toUTCString());
		}
		return;
	}
	if (eTag) {
		context.header('ETag', eTag);
		const ifNoneMatch = context.req.header('If-None-Match');
		if (ifNoneMatch === eTag) {
			context.status(304);
			context.json(null);
			return;
		}
	} else {
		const latestModified = extractLastModifiedDateFromList(list, prefix);
		const ifModifiedSinceHeader = context.req.header('If-Modified-Since');
		if (ifModifiedSinceHeader) {
			const ifModifiedSinceDate = new Date(ifModifiedSinceHeader);
			if (!Number.isNaN(ifModifiedSinceDate.getTime())) {
				if (latestModified.getTime() <= ifModifiedSinceDate.getTime()) {
					context.status(304);
					context.json(null);
					return;
				}
			}
		}
		context.header('Last-Modified', latestModified.toUTCString());
	}
}

export function checkPageForCaching<T extends object>(
	page: { data: T[]; metadata: object },
	prefix?: string,
	eTag?: string,
) {
	const context = getContext();
	const { data } = page;
	if (data.length === 0) {
		if (eTag) {
			context.header('ETag', eTag);
			const ifNoneMatch = context.req.header('If-None-Match');
			if (ifNoneMatch === eTag) {
				context.status(304);
				context.json(null);
				return;
			}
		} else {
			context.header('Last-Modified', new Date().toUTCString());
		}
		return;
	}
	if (eTag) {
		context.header('ETag', eTag);
		const ifNoneMatch = context.req.header('If-None-Match');
		if (ifNoneMatch === eTag) {
			context.status(304);
			context.json(null);
			return;
		}
	} else {
		const latestModified = extractLastModifiedDateFromList(data, prefix);
		const ifModifiedSinceHeader = context.req.header('If-Modified-Since');
		if (ifModifiedSinceHeader) {
			const ifModifiedSinceDate = new Date(ifModifiedSinceHeader);
			if (!Number.isNaN(ifModifiedSinceDate.getTime())) {
				if (latestModified.getTime() <= ifModifiedSinceDate.getTime()) {
					context.status(304);
					context.json(null);
					return;
				}
			}
		}
		context.header('Last-Modified', latestModified.toUTCString());
	}
}

export function generateEntityEtag(entity: object, prefix?: string): string {
	return hexaHash(
		`${getField(entity, 'id', prefix)}-${getLastModifiedDate(entity, prefix).getTime()}`,
	);
}

export function generateEtagForList(data: any, prefix?: string): string {
	if (!Array.isArray(data) || data.length === 0) {
		return '';
	}
	return hexaHash(
		`${data.map((entity) => getField(entity, 'id', prefix)).join('.')}-${extractLastModifiedDateFromList(data, prefix).getTime()}`,
	);
}
