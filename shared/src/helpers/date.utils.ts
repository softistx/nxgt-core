export function formatHttpDate(date: Date): string {
	if (Number.isNaN(date.getTime())) {
		return new Date().toUTCString();
	}
	return date.toUTCString();
}
