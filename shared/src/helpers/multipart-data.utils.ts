export function parseMultipart<T>(value: any, jsonFields?: (keyof T)[]): T {
	const result: any = {};
	for (const key in value) {
		try {
			result[key] =
				jsonFields?.includes(key as keyof T) && value[key]
					? JSON.parse(value[key])
					: value[key];
		} catch {
			result[key] = value[key];
		}
	}
	return result as T;
}
