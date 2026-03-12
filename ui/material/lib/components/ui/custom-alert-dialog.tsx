import type { ComponentProps, ReactNode } from 'react';
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	type AlertDialogPrimitive,
	AlertDialogTitle,
	AlertDialogTrigger,
} from './alert-dialog';
import { Separator } from './separator';

export type CustomAlertDialogProps = {
	trigger?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
	footer?: ReactNode;
	icon?: ReactNode;
} & ComponentProps<typeof AlertDialogPrimitive.Root>;

export function CustomAlertDialog({
	icon,
	trigger,
	title,
	description,
	footer,
	children,
	...props
}: CustomAlertDialogProps) {
	return (
		<AlertDialog {...props}>
			{trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
			<AlertDialogContent className="w-full p-4">
				<AlertDialogHeader>
					{icon && (
						<div className="mx-auto sm:mx-0 mb-2 flex size-min">{icon}</div>
					)}
					<AlertDialogTitle
						hidden={!title}
						className="text-2xl font-bold tracking-tight"
					>
						{title}
					</AlertDialogTitle>
					<AlertDialogDescription
						hidden={!description}
						className="!mt-3 text-[15px]"
					>
						{description}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{children && (
					<>
						<Separator />
						{children}
					</>
				)}
				{footer && (
					<>
						<Separator />
						<AlertDialogFooter className="mt-4">{footer}</AlertDialogFooter>
					</>
				)}
			</AlertDialogContent>
		</AlertDialog>
	);
}
