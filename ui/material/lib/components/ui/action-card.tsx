import { CircleCheck } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Card, CardContent, CardDescription, CardTitle } from './card';

export type ActionCardProps = {
	active?: boolean;
	icon?: ReactNode;
	variant?: 'sm' | 'md';
	title?: ReactNode;
	description?: ReactNode;
	withIndicator?: boolean;
} & ComponentProps<typeof Card>;

export function ActionCard({
	icon,
	active,
	className,
	title,
	description,
	variant = 'sm',
	tabIndex = 0,
	withIndicator = true,
	...props
}: ActionCardProps) {
	return (
		<Card
			tabIndex={tabIndex}
			className={cn(
				'flex flex-col cursor-pointer min-w-[16rem] py-4 rounded-md group',
				'hover:border-primary/40 hover:shadow-primary/40 focus-within:border-primary/80 focus-within:shadow-primary/50 hover:scale-[102%]',
				{
					'border-primary/60 shadow-primary': !!active,
					'min-w-[12rem]': variant === 'md',
				},
				className,
			)}
			{...props}
		>
			{variant === 'sm' && (
				<CardContent className={cn('flex gap-4 items-center px-4')}>
					{icon && <ActionCardIcon active={active} icon={icon} />}
					<ActionCardContent title={title} description={description} />
					{withIndicator && <ActionCardIndicator active={active} />}
				</CardContent>
			)}
			{variant === 'md' && (
				<CardContent className={cn('flex flex-col gap-4 px-4')}>
					<div className="flex w-full justify-between">
						{icon && <ActionCardIcon active={active} icon={icon} />}
						{withIndicator && <ActionCardIndicator active={active} />}
					</div>
					<ActionCardContent title={title} description={description} />
				</CardContent>
			)}
		</Card>
	);
}
function ActionCardIcon({
	active,
	icon,
}: Pick<ActionCardProps, 'active' | 'icon'>) {
	return (
		<div
			className={cn(
				"transition-all flex center h-full py-1.5 px-4 border rounded-md [&_svg:not([class*='size-'])]:size-6",
				'*:transition-all *:duration-300 hover:*:rotate-z-45 hover:*:ease-in-out',
				'group-hover:border-primary group-hover:animate-pulse',
				{
					'text-primary-foreground bg-primary fill-primary-foreground':
						!!active,
					'text-muted-foreground border border-muted fill-muted-foreground':
						!active,
					'border-primary animate-pulse': active,
				},
			)}
		>
			{icon}
		</div>
	);
}

function ActionCardIndicator({ active }: Pick<ActionCardProps, 'active'>) {
	return (
		<div className={cn("[&_svg:not([class*='size-'])]:size-4")}>
			<CircleCheck
				className={cn('transition-all rounded-full', {
					'bg-primary text-primary-foreground': !!active,
					'text-primary-foreground border border-muted-foreground': !active,
				})}
			/>
		</div>
	);
}

function ActionCardContent({
	title,
	description,
	className,
}: Pick<ActionCardProps, 'className' | 'title' | 'description'>) {
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			{title && <CardTitle>{title}</CardTitle>}
			{description && <CardDescription>{description}</CardDescription>}
		</div>
	);
}
