import { type Editor, useEditorState } from '@tiptap/react';
import { Link } from 'lucide-react';
import { IconButton } from '../../../..';
import { EditorLink } from './editor-link';
export function EditorLinkWrapper({ editor }: { editor: Editor }) {
	const editorState = useEditorState({
		editor,
		selector: (ctx) => {
			return {
				isLink: ctx.editor.isActive('link') ?? false,
				canLink: ctx.editor.can().chain().toggleLink().run() ?? false,
			};
		},
	});
	return !editorState.isLink ? (
		<EditorLink
			onSubmit={(href) =>
				editor
					.chain()
					.focus()
					.toggleLink({ href, target: '_blank' })
					.blur()
					.run()
			}
		>
			<IconButton
				variant={editorState.isLink ? 'filled' : 'ghost'}
				disabled={!editorState.canLink}
				className="rounded size-7"
			>
				<Link />
			</IconButton>
		</EditorLink>
	) : (
		<IconButton
			variant={editorState.isLink ? 'filled' : 'ghost'}
			disabled={!editorState.canLink}
			onClick={() => editor.chain().focus().toggleLink().run()}
			className="rounded size-7"
		>
			<Link />
		</IconButton>
	);
}
