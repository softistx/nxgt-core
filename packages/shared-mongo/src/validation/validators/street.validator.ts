import { REGEX } from '@nxgt/shared/helpers';
import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function street(args: ValidatorOptions<true>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({}, 'validation.errors.street'),
		validator(value) {
			return (
				isNil(value) || (typeof value === 'string' && REGEX.street.test(value))
			);
		},
	} satisfies ValidateOpts<object, object>;
}
