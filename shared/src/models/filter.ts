export type StringArrayFilter = {
	values: string[];
	operator: 'or' | 'and';
};

export type DateRangeFilter = {
	from?: Date;
	to?: Date;
};
