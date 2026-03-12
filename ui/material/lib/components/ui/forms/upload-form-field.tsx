import { type Control, Controller, type Path } from 'react-hook-form';
import { UploadField, type UploadFieldProps } from '../upload-field';

export function UploadFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<UploadFieldProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<UploadField
					{...props}
					aria-invalid={fieldState.invalid}
					value={
						props.multiple
							? field.value
									?.map((file: any) => file?.name)
									?.filter((item: any) => !!item)
									?.join(', ')
							: field.value
					}
					disabled={field.disabled}
					onBlur={field.onBlur}
					onChange={(event) => {
						field.onChange(
							props.multiple
								? Array.from(event.target.files ?? [])
								: event.target.files?.[0],
						);
					}}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
