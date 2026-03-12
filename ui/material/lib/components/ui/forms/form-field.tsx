import type { ChangeEvent } from 'react';
import { type Control, Controller, type Path } from 'react-hook-form';
import { Field } from '../field';
import type { FieldConfig, FieldType } from '../field/types';

export type FormFieldProps<T extends Record<string, any>> = {
	control: Control<T>;
	name: Path<T>;
	config: FieldConfig;
};

export function FormField<T extends Record<string, any>>({
	control,
	name,
	config,
}: FormFieldProps<T>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => {
				let fieldProps: Record<string, any> = {
					...config,
					error: fieldState.invalid,
					helperText: fieldState.error?.message,
				};

				switch (config.type as FieldType) {
					case 'text':
						fieldProps = {
							...fieldProps,
							value: field.value ?? '',
							onChange: (e: ChangeEvent<HTMLInputElement>) =>
								field.onChange(e.target.value),
							onBlur: field.onBlur,
						};
						break;

					case 'number':
						fieldProps = {
							...fieldProps,
							value: field.value ?? '',
							onChange: (e: ChangeEvent<HTMLInputElement>) => {
								const num = parseFloat(e.target.value);
								field.onChange(Number.isNaN(num) ? null : num);
							},
							onBlur: field.onBlur,
						};
						break;

					case 'textarea':
						fieldProps = {
							...fieldProps,
							value: field.value ?? '',
							onChange: (e: ChangeEvent<HTMLTextAreaElement>) =>
								field.onChange(e.target.value),
							onBlur: field.onBlur,
						};
						break;

					case 'select':
						fieldProps = {
							...fieldProps,
							value: field.value ?? '',
							onValueChange: field.onChange,
						};
						break;

					case 'multi-select':
						fieldProps = {
							...fieldProps,
							value: field.value || [],
							onValueChange: field.onChange,
						};
						break;

					case 'chips-single':
						fieldProps = {
							...fieldProps,
							value: field.value || [],
							onValueChange: field.onChange,
						};
						break;

					case 'chips-multiple':
						fieldProps = {
							...fieldProps,
							value: field.value || [],
							onValueChange: field.onChange,
						};
						break;

					case 'radio-group':
						fieldProps = {
							...fieldProps,
							value: field.value ?? '',
							onValueChange: field.onChange,
						};
						break;

					case 'checkbox-group':
						fieldProps = {
							...fieldProps,
							value: field.value || [],
							onValueChange: field.onChange,
						};
						break;

					case 'switch':
						fieldProps = {
							...fieldProps,
							checked: field.value || false,
							onCheckedChange: field.onChange,
						};
						break;

					case 'date':
						fieldProps = {
							...fieldProps,
							value: field.value,
							onValueChange: field.onChange,
						};
						break;

					case 'date-range':
						fieldProps = {
							...fieldProps,
							value: field.value,
							onValueChange: field.onChange,
						};
						break;

					case 'slider':
						fieldProps = {
							...fieldProps,
							value: field.value ? [Number(field.value)] : [0],
							onValueChange: (value: number[]) => field.onChange(value[0]),
						};
						break;

					case 'time':
						fieldProps = {
							...fieldProps,
							value: field.value,
							onValueChange: field.onChange,
						};
						break;

					case 'location':
						fieldProps = {
							...fieldProps,
							value: field.value,
							onChange: field.onChange,
						};
						break;

					case 'image':
						fieldProps = {
							...fieldProps,
							value: field.value,
							onChange: field.onChange,
						};
						break;

					case 'upload':
						fieldProps = {
							...fieldProps,
							value: field.value,
							onChange: field.onChange,
						};
						break;

					case 'otp':
						fieldProps = {
							...fieldProps,
							value: field.value ?? '',
							onChange: field.onChange,
						};
						break;

					case 'autocomplete':
						fieldProps = {
							...fieldProps,
							value: field.value || [],
							onValueChange: field.onChange,
						};
						break;

					case 'rich-text-editor':
						fieldProps = {
							...fieldProps,
							value: field.value,
							onChange: field.onChange,
						};
						break;

					case 'check-card':
						fieldProps = {
							...fieldProps,
							value: field.value,
							onValueChange: field.onChange,
						};
						break;

					case 'select-card':
						fieldProps = {
							...fieldProps,
							value: field.value || [],
							onValueChange: field.onChange,
						};
						break;

					default:
						break;
				}

				return <Field config={fieldProps as FieldConfig} />;
			}}
		/>
	);
}
