import { type Control, Controller, type Path } from 'react-hook-form';
import { RichTextEditor, type RichTextEditorProps } from '../rich-text-editor';

export function RichTextEditorFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<RichTextEditorProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<RichTextEditor
					{...props}
					aria-invalid={fieldState.invalid}
					content={field.value}
					editable={!field.disabled}
					onBlur={field.onBlur}
					onUpdate={(event) => {
						field.onChange(event.editor.getHTML());
					}}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
