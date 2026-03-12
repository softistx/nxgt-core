import { type Editor, useEditorState } from '@tiptap/react';
import Chrome from '@uiw/react-color-chrome';
import { GithubPlacement } from '@uiw/react-color-github';
import { useState } from 'react';
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
	IconButton,
} from '../../../..';

export function EditorColorWrapper({ editor }: { editor: Editor }) {
	const editorState = useEditorState({
		editor,
		selector: (ctx) => {
			return {
				color: ctx.editor.getAttributes('textStyle').color,
			};
		},
	});

	const [open, setOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton variant={'ghost'}>
					<div
						className="size-4"
						style={{ backgroundColor: editorState.color ?? 'black' }}
					></div>
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-background">
				<Chrome
					color={editorState.color}
					placement={GithubPlacement.TopRight}
					onChange={(color) => {
						editor.chain().focus().setColor(color.hex).run();
					}}
					className="*:last:border-none *:last:shadow-none"
				/>
				<Button
					onClick={() => {
						setOpen(false);
					}}
				>
					OK
				</Button>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
