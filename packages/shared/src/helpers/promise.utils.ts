import { logger } from '@nxgt/shared-logging';

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

export async function safeCall<T>(
	promise: Promise<T> | (() => Promise<T>),
): Promise<T | null> {
	const { data, error } = await unwrap(
		typeof promise === 'function' ? promise() : promise,
	);
	if (error) {
		logger.error(`Error in safeCall: ${error.message}`, error);
		return null;
	}
	return data;
}
