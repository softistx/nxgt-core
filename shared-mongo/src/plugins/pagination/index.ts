import type { Schema } from 'mongoose';
import { applyPagination } from './utils';

export const pagination = (schema: Schema) => {
	applyPagination(schema);
};
export * from './types';
