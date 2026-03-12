import { type Control, Controller, type Path } from 'react-hook-form';
import { OtpField, type OtpFieldProps } from '../otp-field';

export function OtpFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<
	OtpFieldProps,
	'name' | 'value'
>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<OtpField
					{...props}
					id={props.id ?? field.name}
					aria-invalid={fieldState.invalid}
					value={field.value ?? ''}
					disabled={field.disabled}
					onChange={field.onChange}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
