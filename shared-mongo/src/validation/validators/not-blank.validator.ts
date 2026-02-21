import { isEmpty, isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function notBlank(args: ValidatorOptions<true>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({}, 'validation.errors.not-blank'),
		validator(value) {
			return (
				isNil(value) || (typeof value === 'string' && !isEmpty(value.trim()))
			);
		},
	} satisfies ValidateOpts<object, object, object>;
}
