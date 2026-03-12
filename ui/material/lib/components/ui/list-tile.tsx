import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Typography } from './typography';

export type ListTileProps = {
	leading?: ReactNode;
	trailing?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
} & Omit<ComponentProps<'div'>, 'children' | 'value' | 'title'>;

export function ListTile({
	title,
	subtitle,
	leading,
	trailing,
	className,
	...props
}: ListTileProps) {
	return (
		<div
			data-slot="item-detail"
			className={cn(
				"flex p-2 px-4 gap-4 center w-full bg-primary/5 rounded [&_svg:not([class*='size-'])]:size-4",
				'[&_[data-slot=icon-button]]:rounded',
				className,
			)}
			{...props}
		>
			{leading && leading}
			<div className="flex flex-col grow">
				<Typography className="font-semibold">{title}</Typography>
				{subtitle && (
					<Typography className="text-muted-foreground">{subtitle}</Typography>
				)}
			</div>
			{trailing && trailing}
		</div>
	);
}
