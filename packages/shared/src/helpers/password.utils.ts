async function hash(raw: string) {
	return Bun.password.hash(raw);
}

async function match(password: string, hash: string) {
	return Bun.password.verify(password, hash);
}

export const PASSWORD_UTILS = {
	hash,
	match,
};
