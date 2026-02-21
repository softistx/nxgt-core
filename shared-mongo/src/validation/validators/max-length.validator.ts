import { isArray, isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function maxLength(args: ValidatorOptions<number>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.(
			{ maxLength: options.value },
			'validation.errors.max-length',
		),
		validator(value) {
			return (
				isNil(value) ||
				(typeof value === 'string' && value.length <= options.value) ||
				(isArray(value) && value.length <= options.value)
			);
		},
	} satisfies ValidateOpts<object, object, object>;
}
