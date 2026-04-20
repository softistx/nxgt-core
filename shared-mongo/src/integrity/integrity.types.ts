// ─── Blockers ─────────────────────────────────────────────────────────────────

export type DeletionBlocker = (ids: string[]) => Promise<number>;

export type BlockerOption = {
	id: string;
	fn: DeletionBlocker;
	errorCode: string;
};

export type RegisterBlockerOptions = {
	id: string;
	model: string;
	errorCode: string;
	blocker: DeletionBlocker;
};

// ─── Cascades ─────────────────────────────────────────────────────────────────

export type CascadeHandler = (ids: string[]) => Promise<void>;

export type CascadeOption = {
	id: string;
	fn: CascadeHandler;
};

export type RegisterCascadeOptions = {
	/** Unique identifier for this cascade — used for deduplication. */
	id: string;
	/** Mongoose model name (e.g. `OrderModel.name`) of the parent being deleted. */
	model: string;
	/** Cleanup function executed inside the deletion transaction. */
	cascade: CascadeHandler;
};
