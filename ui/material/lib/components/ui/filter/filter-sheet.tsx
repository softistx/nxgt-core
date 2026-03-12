'use client';

import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';
import { ScrollArea } from '../scroll-area';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '../sheet';
import { FilterActions } from './filter-actions';
import { FilterContent } from './filter-content';
import { FilterProvider, type FilterProviderProps } from './filter-context';
import { FilterTrigger } from './filter-trigger';
import { useFilterModal } from './use-filter-modal';

export type FilterSheetProps = Omit<FilterProviderProps, 'children'> & {
	trigger?: ReactNode;
	title?: string;
	description?: string;
	triggerLabel?: string;
	showTriggerCount?: boolean;
	side?: 'top' | 'right' | 'bottom' | 'left';
	contentClassName?: string;
	actionsClassName?: string;
};

/**
 * FilterSheet - Filter component in a slide-in sheet
 */
export function FilterSheet({
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
	side = 'right',
	contentClassName,
	actionsClassName,
}: FilterSheetProps) {
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
			<Sheet open={open} onOpenChange={handleOpenChange}>
				<SheetTrigger asChild>
					{trigger || (
						<FilterTrigger label={triggerLabel} showCount={showTriggerCount} />
					)}
				</SheetTrigger>
				<SheetContent side={side} className="flex flex-col">
					<SheetHeader>
						<SheetTitle>{title}</SheetTitle>
						{description && <SheetDescription>{description}</SheetDescription>}
						<SheetClose />
					</SheetHeader>
					<ScrollArea className="flex-1">
						<div className="p-4">
							<FilterContent className={contentClassName} />
						</div>
					</ScrollArea>
					<SheetFooter className="mt-auto">
						<FilterActions className={cn('w-full', actionsClassName)} />
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</FilterProvider>
	);
}
