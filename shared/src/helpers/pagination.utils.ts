import type { HonoRequest } from 'hono';
import { z } from 'zod';

export const PAGINATION_PARAMS = z
	.object({
		page: z.number(),
		size: z.number(),
		paginated: z.boolean(),
	})
	.partial();

export const SEARCH_REQUEST = z
	.object({
		filter: z.any().optional(),
		size: z.any().optional(),
	})
	.partial();

export type PaginationParams = z.infer<typeof PAGINATION_PARAMS>;

export interface CursorPaginationParams {
	first?: number;
	last?: number;
	after?: string;
	before?: string;
}

export function extractPaginationParams(req: HonoRequest) {
	const { page, size, paginated } = req.query();
	return {
		page: parseInt(page ?? '0', 10),
		size: parseInt(size ?? '20', 10),
		paginated: Boolean(paginated ?? 'true'),
	};
}

export function extractCursorPaginationParams(req: HonoRequest) {
	const { first, last, before, after } = req.query();
	return {
		first: first ? parseInt(first, 10) : undefined,
		last: last ? parseInt(last, 10) : undefined,
		before,
		after,
	};
}

export function decodeCursor(cursor: string | undefined): string | null {
	if (!cursor) return null;
	try {
		return Buffer.from(cursor, 'base64').toString('utf-8');
	} catch {
		return null;
	}
}

export function encodeCursor(id: string): string {
	return Buffer.from(id).toString('base64');
}
