import { format } from 'date-fns';
import { useCallback } from 'react';
import {
	type Control,
	Controller,
	type ControllerRenderProps,
	type Path,
} from 'react-hook-form';
import { DATE_UTILS } from '../../../lib';
import { TimeField, type TimeFieldProps } from '../time-field';

export function TimeFormField<T extends Record<string, any>>({
	control,
	name,
	asString,
	...props
}: { control: Control<T>; name: Path<T>; asString?: boolean } & Omit<
	TimeFieldProps,
	'name'
>) {
	const handlerChange = useCallback(
		(field: ControllerRenderProps<T, Path<T>>) => (value?: Date) => {
			if (asString) {
				field.onChange(value ? format(value, 'HH:mm') : value);
			} else {
				field.onChange(value);
			}
		},
		[asString],
	);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<TimeField
					{...props}
					id={props.id ?? field.name}
					aria-invalid={fieldState.invalid}
					value={
						asString
							? DATE_UTILS.parseFromTimestring(field.value ?? '00:00')
							: (field.value ?? new Date())
					}
					disabled={field.disabled}
					onBlur={field.onBlur}
					onValueChange={handlerChange(field)}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
