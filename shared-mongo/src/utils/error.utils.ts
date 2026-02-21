import type { LocaleKey } from '@nxgt/i18n';
import { CustomException } from '@nxgt/shared-exceptions';
import mongoose from 'mongoose';

export function castError(error: mongoose.MongooseError) {
	let props: { message?: LocaleKey; options?: object } = {};
	if (error instanceof CustomException) {
		return error;
	}
	switch (true) {
		case error instanceof mongoose.Error.CastError:
			props = {
				message: 'errors.cast-failed',
				options: { field: error.path },
			};
			break;
		case error instanceof mongoose.Error.DocumentNotFoundError:
			props = {
				message: 'errors.not-found',
			};
			break;
		case error instanceof mongoose.Error.MongooseServerSelectionError:
			props = {
				message: 'errors.server-connection-failed',
			};
			break;
		case error instanceof mongoose.Error.ValidationError:
			props = {
				message: Object.values(error.errors)
					.map((e) => e.message)
					.join(' ') as LocaleKey,
			};
			break;
		default:
			props = {
				message: 'errors.something-went-wrong',
			};
	}

	return CustomException.badRequest({
		message: props.message || '',
		options: props.options,
		debugMessage: error.message,
	});
}
