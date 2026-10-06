import { describe, expect, test } from 'bun:test';
import { declaredNames, ours, parse } from './check-shared-mongo-declarations';

const OUTPUT = [
	'node_modules/.bun/@types+nodemailer@8.0.1/node_modules/@types/nodemailer/lib/smtp-connection/index.d.ts(103,15): error TS2430: Interface incorrectly extends.',
	'  Types of property are incompatible.',
	"node_modules/.bun/mongoose@9.9.2/node_modules/mongoose/types/models.d.ts(224,20): error TS2428: All declarations of 'Model' must have identical type parameters.",
	"node_modules/.bun/other@1/node_modules/other/index.d.ts(1,1): error TS2428: All declarations of 'Thing' must have identical type parameters.",
	"packages/shared-mongo/src/types/shared.d.ts(9,19): error TS2428: All declarations of 'Model' must have identical type parameters.",
	'packages/shared-mongo/src/foo.ts(1,1): error TS2322: Anything at all.',
].join('\n');

describe('check-shared-mongo-declarations', () => {
	const all = parse(OUTPUT);
	const names = new Set(declaredNames('export interface Model<T> {}'));

	test('parse keeps the first line of each diagnostic only', () => {
		expect(all).toHaveLength(5);
	});

	test('keeps shared-mongo files and mongoose-side declaration clashes', () => {
		expect(ours(all, names).map((d) => d.file)).toEqual([
			'node_modules/.bun/mongoose@9.9.2/node_modules/mongoose/types/models.d.ts',
			'packages/shared-mongo/src/types/shared.d.ts',
			'packages/shared-mongo/src/foo.ts',
		]);
	});

	test('drops third-party noise, even a TS2428 on a name it does not augment', () => {
		const dropped = ours(all, names).map((d) => d.code + d.file);
		expect(dropped.join()).not.toContain('nodemailer');
		expect(dropped.join()).not.toContain('other');
	});
});
