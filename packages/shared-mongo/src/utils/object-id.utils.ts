import mongoose from 'mongoose';

export function objectIdString() {
	return new mongoose.mongo.ObjectId().toHexString();
}

export function objectIdFromString(id: string) {
	return new mongoose.mongo.ObjectId(id);
}
