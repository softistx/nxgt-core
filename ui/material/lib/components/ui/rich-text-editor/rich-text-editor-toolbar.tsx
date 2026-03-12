import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
	Bold,
	Italic,
	List,
	ListCheck,
	ListOrdered,
	Minus,
	Quote,
	Strikethrough,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../../lib/utils';
import { IconButton } from '../buttons';
import { Separator } from '../separator';
import { EditorCodeBlock } from './extensions/code';
import { EditorColorWrapper } from './extensions/color';
import { EmojiPicker } from './extensions/emoji';
import { HeadingWrapper } from './extensions/heading';
import { EditorLinkWrapper } from './extensions/link';
import { EditorTableWrapper } from './extensions/table';

export function RichTextEditorToolbar({
	editor,
	className,
	...props
}: {
	editor: Editor;
	options?: {
		onSave?: () => void;
		onCancel?: () => void;
		labels?: { save?: string; cancel?: string };
	};
	className?: string;
} & ComponentProps<'div'>) {
	const editorState = useEditorState({
		editor,
		selector: (ctx) => {
			return {
				isBold: ctx.editor.isActive('bold') ?? false,
				canBold: ctx.editor.can().chain().toggleBold().run() ?? false,
				isItalic: ctx.editor.isActive('italic') ?? false,
				canItalic: ctx.editor.can().chain().toggleItalic().run() ?? false,
				isStrike: ctx.editor.isActive('strike') ?? false,
				canStrike: ctx.editor.can().chain().toggleStrike().run() ?? false,
				canClearMarks: ctx.editor.can().chain().unsetAllMarks().run() ?? false,
				isParagraph: ctx.editor.isActive('paragraph') ?? false,
				isBulletList: ctx.editor.isActive('bulletList') ?? false,
				isOrderedList: ctx.editor.isActive('orderedList') ?? false,
				isBlockquote: ctx.editor.isActive('blockquote') ?? false,
				isTaskList: ctx.editor.isActive('taskList') ?? false,
				canTaskList: ctx.editor.can().chain().toggleTaskList().run() ?? false,
			};
		},
	});

	return (
		<div
			data-slot="rich-text-editor-toolbar"
			{...props}
			className={cn(
				'flex flex-wrap justify-end gap-1 *:rounded **:data-[slot=separator]:mx-1 *:size-7',
				{ hidden: !editor.isEditable },
				'**:data-[slot=separator]:h-6',
				className,
			)}
		>
			<IconButton
				variant={editorState.isBold ? 'filled' : 'ghost'}
				onClick={() => editor.chain().focus().toggleBold().run()}
				disabled={!editorState.canBold}
			>
				<Bold />
			</IconButton>
			<IconButton
				variant={editorState.isItalic ? 'filled' : 'ghost'}
				onClick={() => editor.chain().focus().toggleItalic().run()}
				disabled={!editorState.canItalic}
			>
				<Italic />
			</IconButton>
			<IconButton
				variant={editorState.isStrike ? 'filled' : 'ghost'}
				onClick={() => editor.chain().focus().toggleStrike().run()}
				disabled={!editorState.canStrike}
			>
				<Strikethrough />
			</IconButton>
			<Separator orientation="vertical" />
			<EditorCodeBlock editor={editor} />
			<Separator orientation="vertical" />
			<HeadingWrapper editor={editor} />
			<EditorColorWrapper editor={editor} />
			<Separator orientation="vertical" />
			<IconButton
				variant={editorState.isBulletList ? 'filled' : 'ghost'}
				onClick={() => editor.chain().focus().toggleBulletList().run()}
			>
				<List />
			</IconButton>
			<IconButton
				variant={editorState.isOrderedList ? 'filled' : 'ghost'}
				onClick={() => editor.chain().focus().toggleOrderedList().run()}
			>
				<ListOrdered />
			</IconButton>
			<IconButton
				variant={editorState.isTaskList ? 'filled' : 'ghost'}
				onClick={() => editor.chain().focus().toggleTaskList().run()}
			>
				<ListCheck />
			</IconButton>
			<IconButton
				variant={editorState.isBlockquote ? 'filled' : 'ghost'}
				onClick={() => editor.chain().focus().toggleBlockquote().run()}
			>
				<Quote />
			</IconButton>
			<IconButton
				variant={'ghost'}
				onClick={() => editor.chain().focus().setHorizontalRule().run()}
			>
				<Minus />
			</IconButton>
			<EmojiPicker editor={editor} />
			<Separator orientation="vertical" />
			<EditorLinkWrapper editor={editor} />
			<Separator orientation="vertical" />
			<EditorTableWrapper editor={editor} />
		</div>
	);
}
