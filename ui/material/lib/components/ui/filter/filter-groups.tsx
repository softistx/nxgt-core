'use client';

import { ChevronDownIcon } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../../../lib/utils';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../collapsible';
import { Separator } from '../separator';
import { getGroupFields, isFieldVisible } from './filter.utils';
import { useFilterContext } from './filter-context';
import { FilterField } from './filter-field';
import type { FilterGroup as FilterGroupType } from './types';

export type FilterGroupProps = {
	group: FilterGroupType;
	className?: string;
};

/**
 * FilterGroup - Renders a group of filter fields with optional collapsible behavior
 */
export function FilterGroup({ group, className }: FilterGroupProps) {
	const { state, actions, schema } = useFilterContext();

	const visibleFields = useMemo(
		() =>
			getGroupFields(schema, group).filter((field) =>
				isFieldVisible(field, state.values),
			),
		[schema, group, state.values],
	);

	if (visibleFields.length === 0) {
		return null;
	}

	const isExpanded = state.groupState.expandedGroups.includes(group.id);

	const content = (
		<div
			className="grid gap-4 
        grid-cols-1 
        @sm:grid-cols-2 
        @lg:grid-cols-3 
        @2xl:grid-cols-4"
		>
			{visibleFields.map((field) => (
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
	);

	if (!group.collapsible) {
		return (
			<div className={cn('space-y-4', className)}>
				<div>
					<h3 className="flex items-center gap-2 text-base font-semibold">
						{group.icon}
						{group.label}
					</h3>
					{group.description && (
						<p className="text-muted-foreground mt-1 text-sm">
							{group.description}
						</p>
					)}
				</div>
				{content}
			</div>
		);
	}

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={(open) => actions.setGroupExpanded(group.id, open)}
			className={cn('space-y-4', className)}
		>
			<CollapsibleTrigger className="hover:bg-accent group w-full rounded-md p-2 transition-colors">
				<div className="flex items-center justify-between gap-2">
					<h3 className="flex items-center gap-2 text-base font-semibold">
						{group.icon}
						{group.label}
					</h3>
					<ChevronDownIcon
						className={cn(
							'size-4 transition-transform duration-200',
							isExpanded && 'rotate-180',
						)}
					/>
				</div>
				{group.description && (
					<p className="text-muted-foreground mt-1 text-left text-sm">
						{group.description}
					</p>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent className="space-y-4">{content}</CollapsibleContent>
		</Collapsible>
	);
}

/**
 * FilterGroups - Renders all groups from the schema
 */
export function FilterGroups({ className }: { className?: string }) {
	const { schema } = useFilterContext();

	if (!schema.groups || schema.groups.length === 0) {
		return null;
	}

	return (
		<div className={cn('space-y-6', className)}>
			{schema.groups.map((group, index) => (
				<div key={group.id}>
					<FilterGroup group={group} />
					{index < (schema.groups?.length || 0) - 1 && (
						<Separator className="mt-6" />
					)}
				</div>
			))}
		</div>
	);
}
