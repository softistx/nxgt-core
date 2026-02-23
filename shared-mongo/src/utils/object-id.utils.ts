import mongoose from 'mongoose';

export function objectIdString() {
	return new mongoose.mongo.ObjectId().toHexString();
}
