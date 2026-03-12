'use client';

import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from '../drawer';
import { ScrollArea } from '../scroll-area';
import { FilterActions } from './filter-actions';
import { FilterContent } from './filter-content';
import { FilterProvider, type FilterProviderProps } from './filter-context';
import { FilterTrigger } from './filter-trigger';
import { useFilterModal } from './use-filter-modal';

export type FilterDrawerProps = Omit<FilterProviderProps, 'children'> & {
	trigger?: ReactNode;
	title?: string;
	description?: string;
	triggerLabel?: string;
	showTriggerCount?: boolean;
	direction?: 'top' | 'bottom' | 'left' | 'right';
	contentClassName?: string;
	actionsClassName?: string;
};

/**
 * FilterDrawer - Filter component in a drawer (mobile-friendly bottom sheet)
 */
export function FilterDrawer({
	schema,
	values,
	defaultValues,
	onChange,
	onApply,
	onReset,
	persistence,
	presetConfig,
	liveUpdate = false,
	disabled = false,
	trigger,
	title = 'Filters',
	description,
	triggerLabel = 'Filters',
	showTriggerCount = true,
	direction = 'bottom',
	contentClassName,
	actionsClassName,
}: FilterDrawerProps) {
	const { open, handleOpenChange, handleApply } = useFilterModal(onApply);
	return (
		<FilterProvider
			schema={schema}
			values={values}
			defaultValues={defaultValues}
			onChange={onChange}
			onApply={handleApply}
			onReset={onReset}
			persistence={persistence}
			presetConfig={presetConfig}
			liveUpdate={liveUpdate}
			disabled={disabled}
		>
			<Drawer open={open} onOpenChange={handleOpenChange} direction={direction}>
				<DrawerTrigger asChild>
					{trigger || (
						<FilterTrigger label={triggerLabel} showCount={showTriggerCount} />
					)}
				</DrawerTrigger>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
						{description && (
							<DrawerDescription>{description}</DrawerDescription>
						)}
						{(direction === 'left' || direction === 'right') && <DrawerClose />}
					</DrawerHeader>
					<ScrollArea className="max-h-[60vh]">
						<div className="px-4">
							<FilterContent className={contentClassName} />
						</div>
					</ScrollArea>
					<DrawerFooter>
						<FilterActions className={cn('w-full', actionsClassName)} />
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		</FilterProvider>
	);
}
