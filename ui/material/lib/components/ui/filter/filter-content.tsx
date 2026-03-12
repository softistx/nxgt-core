'use client';

import { cn } from '../../../lib/utils';
import { Separator } from '../separator';
import { getUngroupedFields, isFieldVisible } from './filter.utils';
import { useFilterContext } from './filter-context';
import { FilterField } from './filter-field';
import { FilterGroups } from './filter-groups';

export type FilterContentProps = {
	className?: string;
};

/**
 * FilterContent - Main filter UI that renders all filter fields
 *
 * Supports both grouped and ungrouped fields with container query responsiveness
 */
export function FilterContent({ className }: FilterContentProps) {
	const { state, actions, schema } = useFilterContext();

	const ungroupedFields = getUngroupedFields(schema);
	const visibleUngroupedFields = ungroupedFields.filter((field) =>
		isFieldVisible(field, state.values),
	);

	const hasGroups = schema.groups && schema.groups.length > 0;
	const hasUngroupedFields = visibleUngroupedFields.length > 0;

	return (
		<div className={cn('@container w-full space-y-6', className)}>
			{/* Ungrouped fields render first */}
			{hasUngroupedFields && (
				<div
					className={cn(
						'grid gap-4 grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 @2xl:grid-cols-4 place-items-end',
					)}
				>
					{visibleUngroupedFields.map((field) => (
						<FilterField
							key={field.id}
							field={field}
							value={state.values[field.id]}
							onChange={(value) => actions.setValue(field.id, value)}
							onBlur={() => actions.validateField(field.id)}
							error={state.errors[field.id]}
							disabled={field.disabled}
						/>
					))}
				</div>
			)}

			{/* Separator between ungrouped and grouped */}
			{hasUngroupedFields && hasGroups && <Separator />}

			{/* Grouped fields */}
			{hasGroups && <FilterGroups />}

			{/* Empty state */}
			{!hasUngroupedFields && !hasGroups && (
				<div className="text-muted-foreground text-center text-sm">
					No filters available
				</div>
			)}
		</div>
	);
}
