import { type Control, Controller, type Path } from 'react-hook-form';
import { Switch, type SwitchProps } from '../switch';

export function SwitchFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<SwitchProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Switch
					{...props}
					id={props.id ?? name}
					name={name}
					aria-invalid={fieldState.invalid}
					checked={!!field.value}
					disabled={field.disabled}
					onBlur={field.onBlur}
					onCheckedChange={field.onChange}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
