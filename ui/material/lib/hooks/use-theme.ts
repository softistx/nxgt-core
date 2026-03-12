import { useLocalStorage, useMedia } from 'react-use';

export function useTheme() {
	const isDark = useMedia('(prefers-color-scheme: dark)');
	const [value, setValue, remove] = useLocalStorage('theme');

	const theme = value
		? value === 'light'
			? 'light'
			: 'dark'
		: isDark
			? 'dark'
			: 'light';

	const setTheme = (value: 'dark' | 'light' | 'system') => {
		if (value === 'system') {
			remove();
			return;
		}
		setValue(value);
	};

	return { theme, updateTheme: setTheme };
}
