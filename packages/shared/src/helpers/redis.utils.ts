import { logger } from '@nxgt/shared-logging';
import { redis } from 'bun';

const USERS = 'users';

export const KEYS = {
	user(id: string) {
		return `${USERS}/${id}`;
	},
	token(id: string) {
		return `${USERS}/${id}/token`;
	},
};

export function publishTo<T>(channel: string) {
	return async (value: T) => {
		try {
			await redis.publish(channel, JSON.stringify(value ?? {}));
		} catch (error) {
			logger.error(error);
		}
		return value;
	};
}
