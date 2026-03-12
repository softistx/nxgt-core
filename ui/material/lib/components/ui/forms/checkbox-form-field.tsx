import { type Control, Controller, type Path } from 'react-hook-form';
import { Checkbox, type CheckboxProps } from '../checkbox';

export function CheckboxFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<CheckboxProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Checkbox
					{...props}
					id={props.id ?? name}
					name={name}
					aria-invalid={fieldState.invalid}
					checked={field.value ?? 'indeterminate'}
					disabled={field.disabled}
					onCheckedChange={(value) => {
						field.onChange(value === 'indeterminate' ? null : value);
					}}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
