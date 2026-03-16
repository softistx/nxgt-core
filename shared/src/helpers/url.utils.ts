export function searchParams(request: Request): URLSearchParams {
	const url = new URL(request.url);
	return url.searchParams;
}

export function searchParam(request: Request, key: string): string | null {
	const params = searchParams(request);
	return params.get(key);
}
