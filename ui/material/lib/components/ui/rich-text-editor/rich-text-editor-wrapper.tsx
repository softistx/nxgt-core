import type { Editor } from '@tiptap/react';
import { type PropsWithChildren, type ReactNode, useState } from 'react';
import { cn } from '../../../lib/utils';
import { Activity } from '../activity';
import { Button } from '../buttons';
import { HelperText } from '../helper-text';
import { Label } from '../label';
import { Separator } from '../separator';
import { BubbleMenu } from './extensions/bubble-menu';
import { RichTextEditorToolbar } from './rich-text-editor-toolbar';

export function RichTextEditorWrapper({
	editor,
	options,
	label,
	error,
	helperText,
	required,
	children,
	className,
}: {
	editor: Editor;
	options?: {
		onSave?: () => void;
		onCancel?: () => void;
		labels?: { save?: string; cancel?: string };
	};
	label?: ReactNode;
	helperText?: ReactNode;
	required?: boolean;
	error?: boolean;
	className?: string;
} & PropsWithChildren) {
	const [showMenu] = useState(true);

	return (
		<div
			data-slot="rich-text-editor"
			className={cn('grid gap-1.5 w-full min-w-sm max-w-full', className)}
		>
			<Label withAsterisk={required}>{label}</Label>
			<div
				className={cn(
					'flex flex-col gap-2',
					'border border-primary/40 p-4 rounded shadow w-full',
				)}
			>
				<Activity visible={editor.isEditable}>
					<RichTextEditorToolbar editor={editor} />
					<Separator />
				</Activity>
				{children}
			</div>
			{helperText && <HelperText error={error}>{helperText}</HelperText>}
			{editor.isEditable && options?.onSave && (
				<div className="flex gap-2 pl-0.5">
					<Button onClick={options?.onSave}>
						{options?.labels?.save ?? 'Save'}
					</Button>
					<Button variant={'ghost'} onClick={options?.onCancel}>
						{options?.labels?.cancel ?? 'Cancel'}
					</Button>
				</div>
			)}
			{showMenu && editor && <BubbleMenu editor={editor} />}
		</div>
	);
}
