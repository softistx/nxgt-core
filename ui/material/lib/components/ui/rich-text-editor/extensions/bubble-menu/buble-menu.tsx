import { type Editor, useEditorState } from '@tiptap/react';
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Strikethrough } from 'lucide-react';
import { cn } from '../../../../../main';
import { IconButton, Separator } from '../../../..';
import { EditorLinkWrapper } from '../link';

export function BubbleMenu({ editor }: { editor: Editor }) {
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
		<TiptapBubbleMenu
			editor={editor}
			className={cn(
				'flex flex-col bg-background shadow rounded p-2 gap-1',
				'**:data-[slot=icon-button]:rounded **:data-[slot=icon-button]:size-7',
				'**:data-[slot=separator]:h-6 **:data-[slot=separator]:mx-1',
			)}
			options={{ placement: 'bottom', offset: 8 }}
		>
			<div
				className={cn(
					'flex flex-wrap justify-end gap-1',
					{ hidden: !editor.isEditable },
					'**:data-[slot=separator]:h-6',
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
				<EditorLinkWrapper editor={editor} />
			</div>
		</TiptapBubbleMenu>
	);
}
