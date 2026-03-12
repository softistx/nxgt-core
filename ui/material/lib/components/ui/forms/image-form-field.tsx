import { type Control, Controller, type Path } from 'react-hook-form';
import { ImageField, type ImageFieldProps } from '../image-field';

export function ImageFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<ImageFieldProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<ImageField
					{...props}
					aria-invalid={fieldState.invalid}
					value={field.value}
					disabled={field.disabled}
					onBlur={field.onBlur}
					onChange={(event) => {
						field.onChange(event.target.files?.[0]);
					}}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
