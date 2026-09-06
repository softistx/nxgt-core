import type { Schema } from 'mongoose';
import { applySoftDeleteOperations } from './soft-delete';

export function softDelete(schema: Schema) {
	schema.add({ deleted: Boolean });
	applySoftDeleteOperations(schema);
}
