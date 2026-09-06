import { type LocaleKey, translate } from '@nxgt/i18n';
import { cast } from '@nxgt/shared/helpers';
import { isArray, isNil } from 'lodash';
import type { MessageType, ValidatorOptions } from './validation.types';

export function parseValidatorOptions<T>(args: ValidatorOptions<T>): {
	value: T;
	message?: (
		options?: object,
		defaultMessage?: MessageType,
	) => (props: any) => string;
} {
	function parseField<F>(field: F | [F, MessageType]) {
		return isArray(field) && field.length === 2 && typeof field[1] === 'string'
			? { value: field[0], message: field[1] }
			: ({ value: cast(field) } satisfies { value: F; message?: MessageType });
	}

	const field = parseField(args);
	return {
		...field,
		message: (options?: object, defaultMessage?: MessageType) => (props) => {
			return translate(
				(isNil(props.value)
					? 'validation.errors.required'
					: (field.message ?? defaultMessage ?? '')) as LocaleKey,
				{
					...props,
					...options,
				},
			);
		},
	};
}
