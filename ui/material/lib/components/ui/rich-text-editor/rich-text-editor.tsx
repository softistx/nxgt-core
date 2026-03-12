'use client';

import { EditorContent, type UseEditorOptions, useEditor } from '@tiptap/react';
import { cn } from '../../../lib/utils';
import 'highlight.js/styles/github-dark.css';
import { type ReactNode, useEffect } from 'react';
import { extensions } from './extensions';
import { RichTextEditorWrapper } from './rich-text-editor-wrapper';

export type RichTextEditorProps = Omit<
	UseEditorOptions,
	'extensions' | 'editorProps'
> & {
	className?: string;
	options?: {
		onSave?: () => void;
		onCancel?: () => void;
		labels?: { save?: string; cancel?: string };
		mentions?: { suggestions?: string[] };
	};
	label?: ReactNode;
	helperText?: ReactNode;
	required?: boolean;
	error?: boolean;
};

export function RichTextEditor({
	className,
	options,
	label,
	helperText,
	required,
	error,
	editable,
	...props
}: RichTextEditorProps) {
	const editor = useEditor({
		extensions: extensions(options),
		editorProps: {
			attributes: {
				class: cn(
					'prose prose-sm sm:prose-base lg:prose-lg xl:prose-2xl focus:outline-none',
					'max-h-[300px] max-w-full w-full overflow-auto px-1',
				),
			},
		},
		...props,
	});

	useEffect(() => {
		if (editor) {
			editor.setEditable(editable ?? true);
		}
	}, [editable, editor]);

	return (
		<>
			{editor && (
				<RichTextEditorWrapper
					editor={editor}
					options={options}
					label={label}
					helperText={helperText}
					required={required}
					error={error}
					className={className}
				>
					<EditorContent editor={editor} />
				</RichTextEditorWrapper>
			)}
		</>
	);
}
