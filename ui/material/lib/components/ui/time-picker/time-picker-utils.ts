function parseValue(max: number, value?: string) {
	const numeric = parseInt(value ?? '', 10);
	return Number.isNaN(numeric) ? 0 : Math.min(numeric, max);
}

export function parseHours(value: string, period: 'AM' | 'PM') {
	const parsed = parseValue(11, value);
	return period === 'AM' ? parsed : parsed + 12;
}

export function parseMinutes(value?: string) {
	return parseValue(59, value);
}

export function formatValue(value: number) {
	const formated = value < 10 ? `0${value}` : value.toString();
	return formated.length > 2 ? formated.slice(formated.length - 2) : formated;
}
