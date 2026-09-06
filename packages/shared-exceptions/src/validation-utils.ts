import type { zValidator } from '@hono/zod-validator';
import { CustomException } from './custom-exception';

export const zErrorHandling: Parameters<typeof zValidator>[2] = (result) => {
	if (!result.success) {
		throw CustomException.badRequest({
			message: 'errors.validation-failed',
			debugMessage: JSON.stringify(result),
		});
	}
};
