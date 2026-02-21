export type ParsedFunction = {
	args: string[];
	body: string;
};

// biome-ignore lint/complexity/noBannedTypes: Ignore
export const parseFunction = (fn: Function): ParsedFunction => {
	const fnStr = fn.toString().trim();

	let args: string[] = [];
	let body = '';

	if (fnStr.startsWith('function')) {
		const argsMatch = fnStr.match(/\(([^)]*)\)/);
		const bodyMatch = fnStr.match(/\{([\s\S]*)\}/);

		args = argsMatch
			? (argsMatch?.[1] || '').split(',').map((p) => p.trim())
			: [];
		body = bodyMatch?.[1] || '';
	} else {
		// arrow function
		const [argPart, bodyPart] = fnStr.split('=>');

		args = (argPart || '')
			.replace(/[()\s]/g, '')
			.split(',')
			.filter(Boolean);

		body = bodyPart?.trim() || '';

		body = body.startsWith('{')
			? body.replace(/^{|}$/g, '')
			: `return ${bodyPart};`;
	}

	return { args, body };
};

export const expr = <T = any>(body: string, ...args: string[]) =>
	new Function(...args, body) as T;
