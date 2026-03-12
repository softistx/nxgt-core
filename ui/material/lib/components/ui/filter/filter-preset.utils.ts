/**
 * Generate a unique preset ID
 */
export function generatePresetId(): string {
	return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Sort presets (default first, then by creation date)
 */
export function sortPresets<
	T extends { isDefault?: boolean; createdAt: Date | string },
>(presets: T[]): T[] {
	return [...presets].sort((a, b) => {
		// Default preset first
		if (a.isDefault && !b.isDefault) return -1;
		if (!a.isDefault && b.isDefault) return 1;

		// Then by creation date (newest first)
		const dateA =
			typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt;
		const dateB =
			typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt;
		return dateB.getTime() - dateA.getTime();
	});
}
