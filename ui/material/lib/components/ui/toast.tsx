'use client';

import type { ReactNode } from 'react';
import { type ExternalToast, toast as sonnerToast, Toaster } from 'sonner';
import { cn } from '../../lib/utils';
import { Button } from './buttons/button';
import { Typography } from './typography';

export type ToastProps = {
	id: string | number;
	title?: ReactNode;
	description?: ReactNode;
	icon?: ReactNode;
	className?: string;
	action?:
		| {
				label: ReactNode;
				onClick?: () => void;
		  }
		| ((dismiss: () => void) => ReactNode);
};

export type ToastMethodProps = Omit<ToastProps, 'id'> & {
	options?: ExternalToast;
};

export function toast({ options = {}, ...props }: ToastMethodProps) {
	return sonnerToast.custom((id) => <Toast id={id} {...props} />, options);
}

export function Toast({
	icon,
	title,
	description,
	action,
	className,
	id,
}: ToastProps) {
	return (
		<div
			data-slot="toast"
			className={cn(
				"flex starting:scale-0 bg-background shadow-md ring-foreground w-full md:max-w-[364px] min-w-xs min-h-10 items-center transition-all border-l-8 p-2 gap-2 [&_svg:not([class*='size-'])]:size-5 shadow-xs",
				'px-3 shadow-foreground/50 border-l-0 rounded bg-foreground text-background',
				className,
			)}
		>
			{icon && (
				<div
					data-slot="toast-icon"
					className={cn(
						"transition-all flex center h-full border-primary/40 p-1.5 border rounded-md [&_svg:not([class*='size-'])]:size-6 aspect-square",
						'[&_svg]:stroke-primary [&_svg]:[data-slot=icon]:fill-primary',
					)}
				>
					{icon}
				</div>
			)}
			<div className="flex flex-1 items-center">
				<div className="w-full grid">
					{title && <Typography data-slot="toast-title">{title}</Typography>}
					{description && (
						<Typography
							variant={'body-small'}
							data-slot="toast-description"
							className="text-muted-foreground"
						>
							{description}
						</Typography>
					)}
				</div>
			</div>
			{action &&
				(typeof action === 'function' ? (
					<div data-slot="toast-action" className="flex gap-2">
						{action(() => {
							sonnerToast.dismiss(id);
						})}
					</div>
				) : (
					<Button
						data-slot="toast-action"
						variant={'tonal'}
						onClick={() => {
							action.onClick?.();
							sonnerToast.dismiss(id);
						}}
					>
						{action.label}
					</Button>
				))}
		</div>
	);
}

export { Toaster };
