export function delay(millis: number) {
	return new Promise((resolve) => setTimeout(resolve, millis));
}

export async function unwrap<T>(promise: Promise<T>) {
	let data: T | null = null;
	let error: Error | null = null;
	try {
		data = await promise;
	} catch (err) {
		error = err as Error;
	}

	return { data, error };
}
