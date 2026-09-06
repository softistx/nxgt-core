import camelCaseKeys from 'camelcase-keys';
import snakeCaseKeys from 'snakecase-keys';

export function pick<Data extends object, Key extends keyof Data>(
	data: Data,
	keys: Key | Key[],
): Pick<Data, Key> {
	const result = {} as Pick<Data, Key>;

	if (!Array.isArray(keys)) {
		result[keys] = data?.[keys];
	} else {
		for (const key of keys) {
			result[key] = data?.[key];
		}
	}

	return result;
}

export function omit<Data extends object, Key extends keyof Data>(
	data: Data,
	keys: Key | Key[],
): Omit<Data, Key> {
	const result = data;

	if (Array.isArray(keys)) {
		for (const key of keys) {
			delete result?.[key];
		}
	} else {
		delete result?.[keys];
	}

	return <Omit<Data, Key>>(result ?? {});
}

export function cast<T>(value: any) {
	return <T>value;
}

export async function castAsync<T>(value: Promise<any>) {
	return <T>await value;
}

/**
 * Converts a value that can be of type T, null, or undefined into a non-nullable type T. If the value is null or undefined, it throws a TypeError with a message indicating the expected type and the actual value.
 * @param value - The value to be converted to a non-nullable type.
 * @param context - An optional string that provides context for the error message if the value is null or undefined. Defaults to 'value'.
 */
export function nonNullable<T>(
	value: T | null | undefined,
	context = 'value',
): T {
	if (value == null || value === undefined) {
		throw new TypeError(`Expected non-nullable ${context}, got ${value}`);
	}
	return value;
}

/**
 * Removes properties with undefined values from an object. If the cleanNulls parameter is set to true, it also removes properties with null values.
 * @param obj - The object to be cleaned.
 * @param cleanNulls - A boolean indicating whether to also remove properties with null values. Defaults to false.
 * @returns A new object with the specified properties removed.
 */
export function cleanObject<T extends object>(
	obj: T,
	cleanNulls: boolean = false,
): Partial<T> {
	return Object.fromEntries(
		Object.entries(obj).filter(([_, value]) =>
			cleanNulls ? value != null && value !== undefined : value !== undefined,
		),
	) as Partial<T>;
}

/**
 * Assigns properties from one or more source objects to a target object, while removing any properties with undefined values from the sources. The original target object is not modified; instead, a new object is returned with the combined properties.
 * @param target - The target object to which properties will be assigned.
 * @param sources - One or more source objects from which properties will be copied. Properties with undefined values in the source objects will be ignored.
 */
export function assign<T extends object>(target: T, ...sources: Partial<T>[]) {
	for (const source of sources) {
		Object.assign(target, cleanObject(source));
	}
}

export const toCamelCase = <T>(
	obj: any,
	{ deep }: { deep: boolean } = { deep: true },
): T => {
	return camelCaseKeys(obj, { deep }) as T;
};

export const toSnakeCase = <T>(
	obj: any,
	{ deep }: { deep: boolean } = { deep: true },
): T => {
	return snakeCaseKeys(obj, { deep }) as T;
};
