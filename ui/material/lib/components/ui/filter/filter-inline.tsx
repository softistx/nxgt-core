'use client';

import { cn } from '../../../lib/utils';
import { FilterActions } from './filter-actions';
import { FilterContent } from './filter-content';
import { FilterProvider, type FilterProviderProps } from './filter-context';

export type FilterInlineProps = Omit<FilterProviderProps, 'children'> & {
	showActions?: boolean;
	contentClassName?: string;
	actionsClassName?: string;
	className?: string;
};

/**
 * FilterInline - Inline filter component without wrapper
 *
 * Perfect for embedding directly in page layouts
 */
export function FilterInline({
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
	showActions = true,
	contentClassName,
	actionsClassName,
	className,
}: FilterInlineProps) {
	return (
		<FilterProvider
			schema={schema}
			values={values}
			defaultValues={defaultValues}
			onChange={onChange}
			onApply={onApply}
			onReset={onReset}
			persistence={persistence}
			presetConfig={presetConfig}
			liveUpdate={liveUpdate}
			disabled={disabled}
		>
			<div className={cn('space-y-6', className)}>
				<FilterContent className={contentClassName} />
				{showActions && !liveUpdate && (
					<FilterActions className={actionsClassName} />
				)}
			</div>
		</FilterProvider>
	);
}
