import { type Control, Controller, type Path } from 'react-hook-form';
import { CheckboxGroup, type CheckboxGroupProps } from '../checkbox-group';

export function CheckboxGroupFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<CheckboxGroupProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<CheckboxGroup
					{...props}
					id={props.id ?? name}
					aria-invalid={fieldState.invalid}
					value={field.value ?? []}
					onBlur={field.onBlur}
					disabled={field.disabled}
					onValueChange={field.onChange}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
