import { format, parse, parseISO } from 'date-fns';

function formatFromISO(value?: string | null, formatStr: string = 'PP') {
	return value ? format(parseISO(value), formatStr) : '-';
}

function parseFromTimestring(timeString: string) {
	return parse(timeString, 'HH:mm', new Date());
}

function parseFromISOString(isoString?: string) {
	return isoString ? parseISO(isoString) : null;
}

export const DATE_UTILS = {
	format: formatFromISO,
	parseFromTimestring,
	parseFromISOString,
};
