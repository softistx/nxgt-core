type PathImpl<T, K extends keyof T> = K extends string
	? T[K] extends Record<string, any>
		? `${K}.${Path<T[K]>}`
		: K
	: never;

export type Path<T> = PathImpl<T, keyof T>;
