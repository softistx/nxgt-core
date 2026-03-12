'use client';

import { FilterIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Badge } from '../badge';
import { type ButtonProps, ResponsiveButton } from '../buttons';
import { useFilterContext } from './filter-context';

export type FilterTriggerProps = {
	label?: string;
	showCount?: boolean;
} & Omit<ButtonProps, 'children'>;

export function FilterTrigger({
	label = 'Filters',
	showCount = true,
	className,
	...props
}: FilterTriggerProps) {
	const { activeFilterCount } = useFilterContext();

	return (
		<ResponsiveButton
			icon={<FilterIcon className="size-4" />}
			variant="outlined"
			className={cn('gap-2', className)}
			{...props}
		>
			{label}
			{showCount && activeFilterCount > 0 && (
				<Badge variant="default" className="ml-auto">
					{activeFilterCount}
				</Badge>
			)}
		</ResponsiveButton>
	);
}
