import { REGEX } from '@nxgt/shared/helpers';
import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function uuid(args: ValidatorOptions<true>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({}, 'validation.errors.uuid'),
		validator(value) {
			return (
				isNil(value) || (typeof value === 'string' && REGEX.uuid.test(value))
			);
		},
	} satisfies ValidateOpts<object, object>;
}
