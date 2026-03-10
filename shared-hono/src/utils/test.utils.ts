import { type Principal, USER_HEADERS } from '@nxgt/shared/models';
import { mongoose } from '@nxgt/shared-mongo';
import type { Middleware } from 'openapi-fetch';

export function mockUser(
	values: Omit<Principal, 'authorities' | 'id'> & {
		permissions?: string[];
		roles?: string[];
	},
): Principal {
	return {
		id: new mongoose.mongo.ObjectId().toHexString(),
		authorities: [...(values.roles ?? []), ...(values.permissions ?? [])],
		...values,
	};
}

export function mockAuthMiddleware(user: Principal): Middleware {
	return {
		async onRequest({ request }) {
			request.headers.set(USER_HEADERS.ID, user.id);
			request.headers.set(USER_HEADERS.USERNAME, user.username);
			request.headers.set(USER_HEADERS.EMAIL, user.email);
			request.headers.set(USER_HEADERS.AUTHORITIES, user.authorities.join(','));
			request.headers.set(
				USER_HEADERS.BIRTH_DATE,
				user.birthDate?.toISOString() ?? '',
			);
			request.headers.set(USER_HEADERS.FIRST_NAME, user.firstName ?? '');
			request.headers.set(USER_HEADERS.LAST_NAME, user.lastName ?? '');
			return request;
		},
	};
}
