import type { Schema } from 'mongoose';
import { applySharedOperations } from './shared';

export function shared(schema: Schema) {
	applySharedOperations(schema);
}
