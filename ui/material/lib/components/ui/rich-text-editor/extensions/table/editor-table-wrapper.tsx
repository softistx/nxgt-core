import { type Editor, useEditorState } from '@tiptap/react';
import { Table } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
	IconButton,
} from '../../../..';
import { EditorTableMenu } from './editor-table-menu';

export function EditorTableWrapper({ editor }: { editor: Editor }) {
	const editorState = useEditorState({
		editor,
		selector: (ctx) => {
			return {
				isTable: ctx.editor.isActive('table') ?? false,
				canTable: ctx.editor.can().insertTable(),
			};
		},
	});
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant={editorState.isTable ? 'filled' : 'ghost'}
					onClick={() =>
						editor
							.chain()
							.focus()
							.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
							.run()
					}
					disabled={!editorState.canTable}
				>
					<Table />
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<EditorTableMenu editor={editor} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
