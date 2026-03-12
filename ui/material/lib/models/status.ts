export type Status<T> = {
	data?: T | null;
	status: 'success' | 'loading' | 'idle' | 'error';
	error?: string;
};
