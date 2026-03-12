'use client';

import { Plus } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionPrimitive,
} from './accordion';

type AccordionCardProps = {
	items: { title: ReactNode; content: ReactNode }[];
	value?: string[];
	onValueChange?: (value: string[]) => void;
	showIcon?: boolean;
	renderHeader?: (title: ReactNode) => ReactNode;
} & Omit<ComponentProps<'div'>, 'dir'>;

export function AccordionCard({
	items,
	className,
	value,
	onValueChange,
	showIcon = true,
	renderHeader,
	...props
}: AccordionCardProps) {
	return (
		<Accordion
			{...props}
			defaultValue={['accordion-item-0']}
			value={value}
			type="multiple"
			onValueChange={onValueChange}
			className={cn(
				'grid gap-2 max-w-lg my-4 w-full bg-muted/20 p-2',
				className,
			)}
		>
			{items.map(({ title, content }, index) => (
				<AccordionItem
					key={`item-${index.toString()}`}
					value={`accordion-item-${index}`}
					className={cn(
						'rounded shadow-xs bg-background border border-primary/30 p-2',
					)}
				>
					<AccordionPrimitive.Header className="flex transition-all border-b in-[[data-state=closed]]:border-none p-2">
						<AccordionPrimitive.Trigger asChild>
							{renderHeader ? (
								renderHeader(title)
							) : (
								<div
									className={cn(
										'flex flex-1 items-center justify-between py-2  font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-45',
									)}
								>
									{title}
									{showIcon && (
										<Plus className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200" />
									)}
								</div>
							)}
						</AccordionPrimitive.Trigger>
					</AccordionPrimitive.Header>
					<AccordionContent className={cn('p-2 py-4')}>
						{content}
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	);
}
