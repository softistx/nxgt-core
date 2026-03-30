import { z } from 'zod';

export type StringArrayFilter = {
	values?: string[] | null;
	operator?: 'or' | 'and' | null;
};

export type DateRangeFilter = {
	from?: Date | null;
	to?: Date | null;
};

export const DateRangeFilterSchema = z
	.object({
		from: z.coerce.date().nullish(),
		to: z.coerce.date().nullish(),
	})
	.refine((range) => (range.from && range.to ? range.from <= range.to : true), {
		message: 'Invalid date range',
	});
