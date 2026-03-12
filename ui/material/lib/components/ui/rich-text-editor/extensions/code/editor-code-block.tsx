import { type Editor, useEditorState } from '@tiptap/react';
import { common, createLowlight } from 'lowlight';
import { Code2 } from 'lucide-react';
import { IconButton } from '../../../..';

export const lowlight = createLowlight(common);

export function EditorCodeBlock({ editor }: { editor: Editor }) {
	const editorState = useEditorState({
		editor,
		selector: (ctx) => {
			return {
				canCodeBlock: ctx.editor.can().chain().toggleCodeBlock().run() ?? false,
				isCodeBlock: ctx.editor.isActive('codeBlock') ?? false,
			};
		},
	});
	return (
		<IconButton
			variant={editorState.isCodeBlock ? 'filled' : 'ghost'}
			onClick={() =>
				editor.chain().focus().toggleCodeBlock({ language: 'javascript' }).run()
			}
			disabled={!editorState.canCodeBlock}
		>
			<Code2 />
		</IconButton>
	);
}
