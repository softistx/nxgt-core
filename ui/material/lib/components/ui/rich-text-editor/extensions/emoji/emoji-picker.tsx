import type { Editor } from '@tiptap/react';
import { Smile } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
	AlertDialogTrigger,
	IconButton,
} from '../../../..';
import { EmojiList } from './emoji-list';

export function EmojiPicker({ editor }: { editor: Editor }) {
	const [open, setOpen] = useState(false);
	const handleEmojiSelection = useCallback(
		(value: string) => {
			editor.chain().focus().setEmoji(value).run();
			setOpen(false);
		},
		[editor],
	);
	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<IconButton variant={'ghost'} className="rounded size-7">
					<Smile />
				</IconButton>
			</AlertDialogTrigger>
			<AlertDialogContent className="bg-muted p-4">
				<AlertDialogTitle hidden>Emoji picker</AlertDialogTitle>
				<AlertDialogDescription hidden>
					Handle emoji selection
				</AlertDialogDescription>
				<EmojiList
					emojis={editor.storage.emoji.emojis}
					onSelect={handleEmojiSelection}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
