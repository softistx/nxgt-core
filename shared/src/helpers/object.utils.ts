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
