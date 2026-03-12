import { type Editor, useEditorState } from '@tiptap/react';
import { Merge, Plus, Split, Trash } from 'lucide-react';
import { cn } from '../../../../../lib/utils';
import { Button, IconButton, Label } from '../../../..';

export function EditorTableMenu({ editor }: { editor: Editor }) {
	const editorState = useEditorState({
		editor,
		selector: (ctx) => {
			return {
				isTable: ctx.editor.isActive('table') ?? false,
				canTable: ctx.editor.can().insertTable(),
				canAddRowBefore: ctx.editor.can().addRowBefore(),
				canAddRowAfter: ctx.editor.can().addRowAfter(),
				canAddColumnBefore: ctx.editor.can().addColumnBefore(),
				canAddColumnAfter: ctx.editor.can().addColumnAfter(),
				canMergeCells: ctx.editor.can().mergeCells(),
				canMergeOrSplit: ctx.editor.can().mergeOrSplit(),
			};
		},
	});
	return (
		<div
			className={cn(
				'grid **:data-[slot=label]:text-muted-foreground p-2 gap-1',
			)}
		>
			<Label>Table</Label>
			<div className={cn('flex gap-2 mb-2')}>
				<IconButton
					variant={'tonal'}
					disabled={!editorState.canTable}
					onClick={() => {
						editor
							.chain()
							.focus()
							.insertTable({ rows: 4, cols: 4, withHeaderRow: true })
							.run();
					}}
				>
					<Plus />
				</IconButton>
				<IconButton
					variant={'tonal'}
					color="error"
					disabled={!editorState.isTable}
					onClick={() => {
						editor.chain().focus().deleteTable().run();
					}}
				>
					<Trash />
				</IconButton>
			</div>
			{editorState.isTable && (
				<>
					<Label>Rows</Label>
					<div className={cn('flex gap-2 mb-2')}>
						<Button
							variant={'tonal'}
							disabled={!editorState.canAddRowBefore}
							onClick={() => editor.chain().focus().addRowBefore().run()}
						>
							Insert before
						</Button>
						<Button
							variant={'tonal'}
							disabled={!editorState.canAddRowAfter}
							onClick={() => editor.chain().focus().addRowAfter().run()}
						>
							Insert after
						</Button>
					</div>
					<Label>Columns</Label>
					<div className={cn('flex gap-2 mb-2')}>
						<Button
							variant={'tonal'}
							disabled={!editorState.canAddColumnBefore}
							onClick={() => editor.chain().focus().addColumnBefore().run()}
						>
							Insert before
						</Button>
						<Button
							variant={'tonal'}
							disabled={!editorState.canAddColumnAfter}
							onClick={() => editor.chain().focus().addColumnAfter().run()}
						>
							Insert after
						</Button>
					</div>
					<Label>Merge & Splitting</Label>
					<div className={cn('flex gap-2 mb-2')}>
						<Button
							variant={'tonal'}
							disabled={!editorState.canMergeCells}
							onClick={() => editor.chain().focus().mergeCells().run()}
						>
							<Merge />
						</Button>
						<Button
							variant={'tonal'}
							disabled={!editorState.canAddColumnBefore}
							onClick={() => editor.chain().focus().mergeOrSplit().run()}
						>
							<Split />
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
