import { describe, expect, it } from 'bun:test';
import type { QueryFilter } from 'mongoose';
import {
	addFilterCondition,
	buildLogicalFilter,
	buildStringFilter,
} from './filter.utils';

type DemoFilter = {
	name?: { operator: 'CONTAINS'; value?: string | null } | null;
	active?: boolean | null;
	AND?: DemoFilter[] | null;
	OR?: DemoFilter[] | null;
	NOT?: DemoFilter | null;
};

/**
 * Mirrors the shape every module's `build<Entity>Filter` has, so the spec
 * exercises `buildLogicalFilter` exactly the way the modules call it.
 */
function buildDemoFilter(filter?: DemoFilter | null): QueryFilter<any> {
	const mongoFilter = buildLogicalFilter(filter, buildDemoFilter);

	if (!filter) return mongoFilter;

	addFilterCondition(mongoFilter, 'name', buildStringFilter(filter.name));

	if (typeof filter.active === 'boolean') {
		mongoFilter.active = filter.active;
	}

	return mongoFilter;
}

describe('buildLogicalFilter', () => {
	it('Should return an empty filter when no filter is given', () => {
		expect(buildLogicalFilter(undefined, buildDemoFilter)).toEqual({});
		expect(buildLogicalFilter(null, buildDemoFilter)).toEqual({});
	});

	it('Should return an empty filter when no logical operator is used', () => {
		expect(buildLogicalFilter({ active: true }, buildDemoFilter)).toEqual({});
	});

	it('Should map AND/OR array combinators to $and/$or', () => {
		const result = buildDemoFilter({
			AND: [{ active: true }, { active: false }],
			OR: [{ active: true }],
		});

		expect(result.$and).toEqual([{ active: true }, { active: false }]);
		expect(result.$or).toEqual([{ active: true }]);
	});

	it('Should map a non-array NOT combinator to $not', () => {
		const result = buildDemoFilter({ NOT: { active: true } });

		expect(result.$not).toEqual({ active: true });
	});

	it('Should recurse so nested combinators are built too', () => {
		const result = buildDemoFilter({
			AND: [{ OR: [{ active: true }, { active: false }] }],
		});

		expect(result.$and).toEqual([
			{ $or: [{ active: true }, { active: false }] },
		]);
	});

	it('Should keep the leaf conditions the caller adds afterwards', () => {
		const result = buildDemoFilter({
			active: true,
			AND: [{ active: false }],
		});

		expect(result.active).toBe(true);
		expect(result.$and).toEqual([{ active: false }]);
	});

	it('Should ignore empty combinators', () => {
		const result = buildDemoFilter({ AND: null, OR: undefined, active: true });

		expect(result).toEqual({ active: true });
	});
});
