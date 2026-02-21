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
	return {
		page: parseInt(req.query('page') ?? '0', 10),
		size: parseInt(req.query('size') ?? '20', 10),
		paginated: Boolean(req.query('paginated') ?? 'true'),
	};
}

export function extractCursorPaginationParams(req: HonoRequest) {
	return {
		first: req.query('first')
			? parseInt(req.query('first') as string, 10)
			: undefined,
		last: req.query('last')
			? parseInt(req.query('last') as string, 10)
			: undefined,
		before: req.query('before'),
		after: req.query('after'),
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
