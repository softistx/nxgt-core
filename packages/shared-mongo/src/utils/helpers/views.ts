import { logger } from '@nxgt/shared-logging';
import type { Model, PipelineStage } from 'mongoose';
import mongoose from 'mongoose';

/** Whether `name` currently exists as a *view* rather than as a collection. */
async function isView(name: string): Promise<boolean> {
	const db = mongoose.connection.db;
	if (!db) return false;

	const [existing] = await db.listCollections({ name }).toArray();
	return existing?.type === 'view';
}

/**
 * (Re)creates `viewModel`'s namespace as a MongoDB view over `model`.
 *
 * The drop-then-create is retried because it races the view model's own
 * `autoCreate`/`autoIndex`: Mongoose materialises the namespace as an ordinary
 * collection when it initialises the model, and if that lands between the drop
 * and the create, the create fails with `NamespaceExists` and the app is left
 * querying an empty collection that will never return a row. It only shows up
 * on a *fresh* database — an existing one already has the view — which is
 * exactly when nobody is watching, so the result is verified rather than
 * assumed, and a definitive failure is logged loudly instead of silently.
 */
export async function safeCreateView<T, R>(
	model: Model<T, any, any, any, any, any, any>,
	viewModel: Model<R, any, any, any, any, any, any>,
	pipeline: PipelineStage[] = [],
	attempts = 3,
) {
	try {
		await model.createCollection();
	} catch (error) {
		logger.error(
			`Error creating collection for model ${model.modelName}:`,
			error,
		);
	}
	const viewName = viewModel.collection.name;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			await mongoose.connection.dropCollection(viewName);
			logger.info(`Dropped existing view for model ${viewModel.modelName}`);
		} catch (error) {
			// Nothing to drop on a fresh database — expected, not a failure.
			logger.debug(
				`No existing namespace to drop for model ${viewModel.modelName}: ${error}`,
			);
		}

		try {
			await viewModel.createCollection({
				viewOn: model.collection.name,
				pipeline,
			});
		} catch (error) {
			logger.error(
				`Error creating view for model ${viewModel.modelName}:`,
				error,
			);
		}

		if (await isView(viewName)) return;

		logger.warn(
			`${viewName} is not a view after attempt ${attempt}/${attempts} — retrying`,
		);

		// Back off before trying again: the competing `autoCreate` is a single
		// round trip, and retrying inside it would just lose the same race at
		// the same point. 50ms, 100ms — short enough not to delay boot.
		if (attempt < attempts) {
			await new Promise((resolve) => setTimeout(resolve, attempt * 50));
		}
	}

	logger.error(
		`Failed to create view ${viewName} for model ${viewModel.modelName}: it exists as a plain collection, so every query through it will come back empty.`,
	);
}
