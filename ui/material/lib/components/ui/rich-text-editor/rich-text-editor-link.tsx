import { Check } from 'lucide-react';
import { type PropsWithChildren, useState } from 'react';
import { cn } from '../../../lib/utils';
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogTrigger,
} from '../alert-dialog';
import { IconButton } from '../buttons';
import { TextField } from '../text-field';

export function RichTextEditorLink({
	children,
	onSubmit,
}: {
	onSubmit: (value: string) => void;
} & PropsWithChildren) {
	const [link, setLink] = useState('');
	const [open, setOpen] = useState(false);
	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
			<AlertDialogContent
				className={cn('flex gap-2 p-2 size-max items-center')}
			>
				<TextField
					value={link}
					onChange={(e) => setLink(e.target.value)}
					placeholder="https://example.com"
				/>
				<IconButton
					onClick={() => {
						onSubmit(link);
						setOpen(false);
						setLink('');
					}}
					className={'rounded mt-1'}
				>
					<Check />
				</IconButton>
			</AlertDialogContent>
		</AlertDialog>
	);
}
