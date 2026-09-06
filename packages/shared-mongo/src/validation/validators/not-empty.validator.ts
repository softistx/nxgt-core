import { isArray, isEmpty, isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function notEmpty(args: ValidatorOptions<true>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({}, 'validation.errors.not-empty'),
		validator(value) {
			return (
				isNil(value) ||
				((typeof value === 'string' || isArray(value)) && !isEmpty(value))
			);
		},
	} satisfies ValidateOpts<object, object>;
}
