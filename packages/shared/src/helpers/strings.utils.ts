import { hash } from 'bun';
import { Types } from 'mongoose';

export const isNumericString = (value: string | undefined): boolean => {
	return (value?.length ?? 0) > 0 && /^\d+$/.test(value || '');
};

export const objectFromString = (value: string): any => {
	try {
		return JSON.parse(value);
	} catch (_e) {
		return {};
	}
};

export function toObjectId(id: string) {
	return new Types.ObjectId(id);
}

export function toObjectIds(ids: string[]) {
	return ids.map(toObjectId);
}

export function hexaHash(data: string | object): string {
	return hash(typeof data === 'object' ? JSON.stringify(data) : data).toString(
		16,
	);
}

export function normalizeUrl(url: string): string {
	return url.replace(/(?<!:)(\/{2,})/g, '/');
}

export const STRINGS_UTILS = {
	toObjectId,
	toObjectIds,
	isNumericString,
	objectFromString,
	hexaHash,
	normalizeUrl,
};
