'use client';

import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../dialog';
import { ScrollArea } from '../scroll-area';
import { FilterActions } from './filter-actions';
import { FilterContent } from './filter-content';
import { FilterProvider, type FilterProviderProps } from './filter-context';
import { FilterTrigger } from './filter-trigger';
import { useFilterModal } from './use-filter-modal';

export type FilterDialogProps = Omit<FilterProviderProps, 'children'> & {
	trigger?: ReactNode;
	title?: string;
	description?: string;
	triggerLabel?: string;
	showTriggerCount?: boolean;
	contentClassName?: string;
	actionsClassName?: string;
};

/**
 * FilterDialog - Filter component in a dialog/modal
 */
export function FilterDialog({
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
	contentClassName,
	actionsClassName,
}: FilterDialogProps) {
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
			<Dialog onOpenChange={handleOpenChange} open={open}>
				<DialogTrigger asChild>
					{trigger ?? (
						<FilterTrigger label={triggerLabel} showCount={showTriggerCount} />
					)}
				</DialogTrigger>
				<DialogContent className="max-h-[90vh] max-w-4xl">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						{description && (
							<DialogDescription>{description}</DialogDescription>
						)}
						<DialogClose />
					</DialogHeader>
					<ScrollArea className="max-h-[60vh]">
						<div className="px-1">
							<FilterContent className={contentClassName} />
						</div>
					</ScrollArea>
					<DialogFooter>
						<FilterActions className={cn('w-full', actionsClassName)} />
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</FilterProvider>
	);
}
