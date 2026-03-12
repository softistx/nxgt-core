'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Typography } from './typography';

function Tabs({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn('flex flex-col items-center gap-2', className)}
			{...props}
		/>
	);
}

function TabsList({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			data-pw="tabs-list"
			className={cn(
				'text-muted-foreground inline-flex w-fit items-end justify-evenly rounded-xs gap-1! shadow-xs p-1 overflow-auto *:h-full',
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	children,
	icon,
	...props
}: { icon?: ReactNode } & ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				'flex flex-col md:flex-row center transition-all duration-300 *:duration-300',
				'md:data-[state=active]:bg-primary/10 dark:data-[state=active]:text-foreground focus-visible:outline-ring md:dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
				'*:transition-all md:hover:bg-primary/10 cursor-pointer data-[state=active]:text-primary hover:text-primary/60 rounded md:rounded',
				'min-h-max p-2 text-center gap-1 md:gap-2',
				'[&_svg:not([class*=size])]:size-4',
				'data-[state=active]:[&_[data-slot=icon]]:bg-primary/10 md:data-[state=active]:[&_[data-slot=icon]]:bg-transparent',
				'w-max max-w-44 h-14',
				className,
			)}
			{...props}
		>
			{icon && (
				<Typography
					data-slot="icon"
					className="w-full p-1 px-2 md:p-0 rounded-full min-w-12 md:min-w-max md:size-max flex justify-center overflow-hidden"
				>
					{icon}
				</Typography>
			)}
			{children && <code className="text-[10px] md:text-xs">{children}</code>}
		</TabsPrimitive.Trigger>
	);
}

function TabsContent({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn('flex-1 outline-none', className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
