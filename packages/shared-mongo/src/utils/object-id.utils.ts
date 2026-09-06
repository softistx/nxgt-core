import mongoose, { Types } from 'mongoose';

export function objectIdString() {
	return new mongoose.mongo.ObjectId().toHexString();
}

export function toObjectId(id: string) {
	return new Types.ObjectId(id);
}

export function toObjectIds(ids: string[]) {
	return ids.map(toObjectId);
}

export function isValidObjectID(id: string | Types.ObjectId) {
	return Types.ObjectId.isValid(id);
}

export function validObjectIds(ids?: string[] | null) {
	return ids?.filter(isValidObjectID);
}

/**
 * sellix-monorepo's name for {@link toObjectId}.
 *
 * It answered a `mongoose.mongo.ObjectId` (the BSON driver's class) where
 * `toObjectId` answers a `Types.ObjectId` (Mongoose's own). The two are
 * interchangeable everywhere either was used, so this is an alias rather than
 * a second implementation.
 */
export function objectIdFromString(id: string) {
	return toObjectId(id);
}
