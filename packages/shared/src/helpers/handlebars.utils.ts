import Handlebars from 'handlebars';

export function renderTemplate(
	template: string,
	context: Record<string, any>,
	options: { escape?: boolean } = {},
): string {
	const compiledTemplate = Handlebars.compile(template, {
		noEscape: options.escape === false,
	});
	return compiledTemplate(context);
}
