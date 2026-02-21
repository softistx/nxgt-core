import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function negative(args: ValidatorOptions<true>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({}, 'validation.errors.negative'),
		validator(value) {
			return isNil(value) || (typeof value === 'number' && value <= 0);
		},
	} satisfies ValidateOpts<object, object, object>;
}
