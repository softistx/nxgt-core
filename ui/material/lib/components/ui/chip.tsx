import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button, type ButtonProps } from './buttons/button';

export type ChipProps = {
	leading?: ReactNode;
	trailing?: ReactNode;
	label: ReactNode;
	active?: boolean;
} & Omit<ButtonProps, 'children' | 'type'>;

export function Chip({
	label,
	leading,
	trailing,
	className,
	active,
	variant = 'outlined',
	...props
}: ChipProps) {
	return (
		<Button
			data-slot="chip"
			data-variant={variant}
			type="button"
			{...props}
			variant={active ? 'filled' : variant}
			className={cn(
				'px-2.5 h-max not-disabled:hover:shadow [&_button]:size-5 rounded-full',
				className,
			)}
		>
			{leading && leading}
			{label}
			{trailing && trailing}
		</Button>
	);
}
