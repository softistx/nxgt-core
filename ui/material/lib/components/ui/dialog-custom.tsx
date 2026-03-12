'use client';

import type { ComponentProps, ReactNode } from 'react';

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from './dialog';
import { Separator } from './separator';

export type CustomDialogProps = {
	icon?: ReactNode;
	trigger?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
	footer?: ReactNode;
} & ComponentProps<typeof Dialog>;

export function CustomDialog({
	icon,
	trigger,
	title,
	description,
	footer,
	children,
	...props
}: CustomDialogProps) {
	return (
		<Dialog {...props}>
			{trigger && <DialogTrigger>{trigger}</DialogTrigger>}
			<DialogContent className="w-full">
				<DialogHeader>
					{icon && (
						<div className="mx-auto sm:mx-0 mb-2 flex size-min">{icon}</div>
					)}
					<DialogTitle
						hidden={!title}
						className="text-2xl font-bold tracking-tight"
					>
						{title}
					</DialogTitle>
					<DialogDescription
						hidden={!description}
						className="!mt-3 text-[15px]"
					>
						{description}
					</DialogDescription>
				</DialogHeader>
				{children && (
					<>
						<Separator />
						{children}
					</>
				)}
				{footer && (
					<>
						<Separator />
						<DialogFooter className="mt-4">{footer}</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
