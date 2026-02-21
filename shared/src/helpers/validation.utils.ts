import type { zValidator } from '@hono/zod-validator';
import z from 'zod';
import { CustomException } from '@/exceptions';

export const DateRangeFilterSchema = z
	.object({
		from: z.coerce.date().nullish(),
		to: z.coerce.date().nullish(),
	})
	.refine((range) => (range.from && range.to ? range.from <= range.to : true), {
		message: 'Invalid date range',
	});

export const zErrorHandling: Parameters<typeof zValidator>[2] = (result) => {
	if (!result.success) {
		throw CustomException.badRequest({
			message: 'errors.validation-failed',
			debugMessage: JSON.stringify(result),
		});
	}
};
