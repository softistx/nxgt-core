/** Reading parsed JSON of an unknown shape: every helper answers with an empty value instead of throwing. */

export type Obj = Record<string, unknown>;

/** The value when it is an object (an array included), else an empty one. */
export const obj = (value: unknown): Obj =>
	value && typeof value === 'object' ? (value as Obj) : {};

/** The value when it is a string, else an empty one. */
export const text = (value: unknown): string =>
	typeof value === 'string' ? value : '';

/** The objects of a GraphQL connection's `nodes`, else none. */
export const nodes = (value: unknown): Obj[] => {
	const list = obj(value)['nodes'];
	return Array.isArray(list) ? list.map(obj) : [];
};
