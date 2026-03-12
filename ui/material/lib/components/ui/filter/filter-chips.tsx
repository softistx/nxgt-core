'use client';

import { XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../../../lib/utils';
import { Chip } from '../chip';
import { DEFAULT_MAX_VISIBLE_CHIPS } from './consts';
import {
	cleanFilterValues,
	formatFilterValue,
	getFilterFieldLabel,
} from './filter.utils';
import type { FilterChipsProps } from './types';

/**
 * FilterChips - Display active filters as removable chips
 */
export function FilterChips({
	schema,
	values,
	onRemove,
	onClearAll,
	maxVisible = DEFAULT_MAX_VISIBLE_CHIPS,
	className,
}: FilterChipsProps) {
	const cleanedValues = useMemo(() => cleanFilterValues(values), [values]);
	const entries = useMemo(() => Object.entries(cleanedValues), [cleanedValues]);

	if (entries.length === 0) {
		return null;
	}

	const visibleEntries = entries.slice(0, maxVisible);
	const hiddenCount = entries.length - visibleEntries.length;

	return (
		<div className={cn('flex flex-wrap items-center gap-2', className)}>
			{visibleEntries.map(([fieldId, value]) => {
				const field = schema.fields.find((f) => f.id === fieldId);
				if (!field) return null;

				const label = getFilterFieldLabel(schema, fieldId);
				const formattedValue = formatFilterValue(field, value);

				return (
					<Chip
						key={fieldId}
						variant="outlined"
						label={
							<>
								<span className="font-medium">{label}:</span>{' '}
								<span>{formattedValue}</span>
							</>
						}
						trailing={<XIcon className="size-3" />}
						onClick={() => onRemove?.(fieldId)}
					/>
				);
			})}

			{hiddenCount > 0 && (
				<Chip variant="outlined" label={`+${hiddenCount} more`} />
			)}

			{entries.length > 1 && onClearAll && (
				<button
					type="button"
					onClick={onClearAll}
					className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
				>
					Clear all
				</button>
			)}
		</div>
	);
}
