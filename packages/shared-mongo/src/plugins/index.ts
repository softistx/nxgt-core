import type { Schema } from 'mongoose';
import autopopulate from 'mongoose-autopopulate';
import leanVirtuals from 'mongoose-lean-virtuals';
import { errors } from './errors';
import { pagination } from './pagination';
import { shared } from './shared';

export const MONGOOSE_PLUGINS = {
	shared,
	errors,
	pagination,
	leanVirtuals,
	autopopulate,
};

export function applyPlugins(schema: Schema, plugins: any[]) {
	plugins.forEach((plugin) => {
		schema.plugin(plugin);
	});
}

export * from './consts';
export * from './pagination/types';
