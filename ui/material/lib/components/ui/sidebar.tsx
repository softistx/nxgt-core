import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { IconButton } from './buttons/icon-button';
import { Typography } from './typography';

export type SidebarProps = {
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	withToggleIcon?: boolean;
} & ComponentProps<'div'>;

export function Sidebar({
	expanded = false,
	children,
	className,
	onExpandedChange,
	withToggleIcon = false,
	...props
}: SidebarProps) {
	return (
		<nav
			data-slot="sidebar"
			data-state={expanded ? 'expanded' : 'collapsed'}
			className={cn(
				'static transition-all relative group flex flex-col h-full gap-2 px-2 max-w-min',
				className,
			)}
			{...props}
		>
			{withToggleIcon && (
				<IconButton
					className={cn(
						'hidden group-hover:flex absolute p-1 size-min -right-4 top-8',
					)}
					variant={'filled'}
					onClick={() => {
						onExpandedChange?.(!expanded);
					}}
				>
					{expanded ? <ChevronLeft /> : <ChevronRight />}
				</IconButton>
			)}
			{children}
		</nav>
	);
}

export function SidebarContent({
	children,
	className,
	...props
}: ComponentProps<'div'>) {
	return (
		<div
			data-slot="sidebar-content"
			className={cn(
				'flex-1 flex flex-col gap-3 overflow-auto center',
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function SidebarHeader({
	children,
	className,
	...props
}: ComponentProps<'div'>) {
	return (
		<div
			data-slot="sidebar-header"
			className={cn(
				'flex flex-col static gap-1 justify-self-start in-[[data-state=collapsed]]:justify-self-center items-center',
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function SidebarFooter({
	children,
	className,
	...props
}: ComponentProps<'div'>) {
	return (
		<div
			data-slot="sidebar-footer"
			className={cn(
				'flex flex-col static gap-1 justify-self-send items-center',
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function SidebarMenuLabel({
	children,
	className,
	actions,
	...props
}: { actions?: ReactNode } & ComponentProps<'div'>) {
	return (
		<div
			data-slot="sidebar-menu-label"
			className={cn(
				'flex gap-4 w-full items-center transition-all py-2 mt-1 [&_button]:size-7 in-[[data-state=collapsed]]:hidden',
				className,
			)}
			{...props}
		>
			<Typography
				variant={'body-small'}
				className={cn('flex-1 uppercase text-muted-foreground self-end')}
			>
				{children}
			</Typography>
			<div className={cn('flex gap-1 justify-end items-center')}>{actions}</div>
		</div>
	);
}
export function SidebarMenuItem({
	icon,
	children,
	className,
	active,
	...props
}: {
	icon?: ReactNode;
	active?: boolean;
} & ComponentProps<'button'>) {
	return (
		<button
			data-slot="sidebar-menu-item"
			className={cn(
				'flex group/item flex-col droup outline-none gap-2 w-max rounded items-center text-muted-foreground cursor-pointer transition-all',
				'in-[[data-state=expanded]]:w-[15rem] in-[[data-state=expanded]]:flex-row in-[[data-state=expanded]]:p-2 in-[[data-state=expanded]]:px-4',
				'in-[[data-state=expanded]]:hover:bg-primary/10',
				'in-[[data-state=collapsed]]:gap-1',
				{
					'in-[[data-state=expanded]]:bg-primary/15 text-primary hover:in-[[data-state=expanded]]:bg-primary/20 [&_svg]:stroke-primary':
						active,
				},
				className,
			)}
			{...props}
		>
			{icon && (
				<div
					data-slot="menu-button-icon"
					className={cn(
						"min-w-7 [&_svg:not([class*='size-'])]:size-5 p-1 in-[[data-state=collapsed]]:px-4.5 in-[[data-state=collapsed]]:rounded-full",
						'in-[[data-state=collapsed]]:group-hover/item:bg-primary/10',
						{
							'[&_svg]:text-primary-foreground': active,
							'in-[[data-state=collapsed]]:bg-primary/15 hover:in-[[data-state=collapsed]]:bg-primary/20 in-[[data-state=collapsed]]:stroke-primary':
								active,
						},
					)}
				>
					{icon}
				</div>
			)}
			{children && (
				<div
					data-slot="menu-button-content"
					className="flex justify-between gap-2 items-center flex-1 in-[[data-state=collapsed]]:text-xs"
				>
					{children}
				</div>
			)}
		</button>
	);
}
