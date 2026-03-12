import { type PropsWithChildren, useState } from 'react';
import { cn } from '../../../../../lib/utils';
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogTrigger,
	Button,
	TextField,
} from '../../../..';
export function EditorLink({
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
			<AlertDialogContent className={cn('flex gap-2 p-2 size-max flex-col')}>
				<TextField
					value={link}
					label={'Link'}
					onChange={(e) => setLink(e.target.value)}
					placeholder="https://example.com"
				/>
				<Button
					onClick={() => {
						onSubmit(link);
						setOpen(false);
						setLink('');
					}}
					variant={'tonal'}
				>
					OK
				</Button>
			</AlertDialogContent>
		</AlertDialog>
	);
}
