import { describe, expect, test } from 'bun:test';
import { renderTemplate } from './handlebars.utils';

describe('renderTemplate', () => {
	test('should render a template with the given context', () => {
		const template = 'Hello, {{name}}!';
		const context = { name: 'World' };
		const result = renderTemplate(template, context);
		expect(result).toBe('Hello, World!');
	});

	test('should render a template with missing context properties', () => {
		const template = 'Hello, {{name}}!';
		const context = {};
		const result = renderTemplate(template, context);
		expect(result).toBe('Hello, !');
	});

	test('should render a template with extra context properties', () => {
		const template = 'Hello, {{name}}!';
		const context = { name: 'World', age: 30 };
		const result = renderTemplate(template, context);
		expect(result).toBe('Hello, World!');
	});
});
