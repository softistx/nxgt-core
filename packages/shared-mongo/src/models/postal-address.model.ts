import { Schema } from 'mongoose';
import { VALIDATORS } from '../validation';

export type PostalAddress = {
	street?: string;
	locality?: string;
	region?: string;
	postalCode?: string;
	country?: string; // ISO 3166-1 alpha-2
};

export const PostalAddressSchema = new Schema<PostalAddress>(
	{
		street: { type: String, validate: VALIDATORS.maxLength(200) },
		locality: { type: String, validate: VALIDATORS.maxLength(100) },
		region: { type: String, validate: VALIDATORS.maxLength(100) },
		postalCode: { type: String, validate: VALIDATORS.maxLength(20) },
		country: { type: String, validate: VALIDATORS.size([2, 2]) },
	},
	{ _id: false },
);
