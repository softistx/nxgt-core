/** A BCP 47 tag as this package writes one: `en`, `pt-BR`. */
export const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** A plain object: not `null`, not an array. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
