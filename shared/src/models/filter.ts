import { z } from 'zod';

export type StringArrayFilter = {
	values: string[];
	operator: 'or' | 'and';
};

export type DateRangeFilter = {
	from?: Date;
	to?: Date;
};

export const DateRangeFilterSchema = z
	.object({
		from: z.coerce.date().nullish(),
		to: z.coerce.date().nullish(),
	})
	.refine((range) => (range.from && range.to ? range.from <= range.to : true), {
		message: 'Invalid date range',
	});
