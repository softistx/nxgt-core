import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function max(args: ValidatorOptions<number>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({ max: options.value }, 'validation.errors.max'),
		validator(value) {
			return (
				isNil(value) || (typeof value === 'number' && value <= options.value)
			);
		},
	} satisfies ValidateOpts<object, object>;
}
