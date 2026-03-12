import type { ChangeEvent } from 'react';
import {
	type Control,
	Controller,
	type ControllerRenderProps,
	type Path,
} from 'react-hook-form';
import { TextField, type TextFieldProps } from '../text-field';

export function NumberFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<
	TextFieldProps,
	'name' | 'type'
>) {
	const handleChange =
		(field: ControllerRenderProps<T, Path<T>>) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			const value = parseFloat(event.target.value ?? '');
			field.onChange(Number.isNaN(value) ? null : value);
		};

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<TextField
					{...props}
					id={props.id ?? field.name}
					type="number"
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
