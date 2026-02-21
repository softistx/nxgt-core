import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import { REGEX } from '../../../helpers';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function pattern(args: ValidatorOptions<string>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.(
			{ pattern: options.value },
			'validation.errors.pattern',
		),
		validator(value) {
			return isNil(value) || REGEX.regex(options.value).test(value.toString());
		},
	} satisfies ValidateOpts<object, object, object>;
}
