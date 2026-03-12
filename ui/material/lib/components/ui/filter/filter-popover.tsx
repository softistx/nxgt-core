'use client';

import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { ScrollArea } from '../scroll-area';
import { FilterActions } from './filter-actions';
import { FilterContent } from './filter-content';
import { FilterProvider, type FilterProviderProps } from './filter-context';
import { FilterTrigger } from './filter-trigger';
import { useFilterModal } from './use-filter-modal';

export type FilterPopoverProps = Omit<FilterProviderProps, 'children'> & {
	trigger?: ReactNode;
	triggerLabel?: string;
	showTriggerCount?: boolean;
	align?: 'start' | 'center' | 'end';
	side?: 'top' | 'right' | 'bottom' | 'left';
	contentClassName?: string;
	actionsClassName?: string;
};

/**
 * FilterPopover - Compact filter component in a popover
 *
 * Perfect for table/list filtering where space is limited
 */
export function FilterPopover({
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
	triggerLabel = 'Filters',
	showTriggerCount = true,
	align = 'start',
	side = 'bottom',
	contentClassName,
	actionsClassName,
}: FilterPopoverProps) {
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
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
					{trigger || (
						<FilterTrigger label={triggerLabel} showCount={showTriggerCount} />
					)}
				</PopoverTrigger>
				<PopoverContent
					align={align}
					side={side}
					className="w-[400px] max-w-[calc(100vw-2rem)] p-4"
				>
					<ScrollArea className="max-h-[70vh]">
						<div className="space-y-4 grid">
							<FilterContent className={contentClassName} />
							<FilterActions className={actionsClassName} />
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</FilterProvider>
	);
}
