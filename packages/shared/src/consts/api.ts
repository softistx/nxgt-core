export const TOKEN_KEYS = {
	access: 'access_token',
	refresh: 'refresh_token',
};

export const AUTH_KEYS = {
	token(uid: string): string {
		return `${uid}:token`;
	},
};
