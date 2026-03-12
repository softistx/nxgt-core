import type { ChangeEvent } from 'react';
import {
	type Control,
	Controller,
	type ControllerRenderProps,
	type Path,
} from 'react-hook-form';
import { TextField, type TextFieldProps } from '../text-field';

export function TextFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<TextFieldProps, 'name'>) {
	const handleChange =
		(field: ControllerRenderProps<T, Path<T>>) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			if (props.type === 'number') {
				const value = parseFloat(event.target.value ?? '');
				field.onChange(Number.isNaN(value) ? null : value);
			} else field.onChange(event);
		};

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<TextField
					{...props}
					id={props.id ?? field.name}
					aria-invalid={fieldState.invalid}
					name={field.name}
					value={field.value ?? ''}
					disabled={field.disabled}
					onBlur={field.onBlur}
					onChange={handleChange(field)}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
