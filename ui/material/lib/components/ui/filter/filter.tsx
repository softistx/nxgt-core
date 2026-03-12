'use client';

import type { ReactNode } from 'react';
import type { FilterProviderProps } from './filter-context';
import { FilterDialog } from './filter-dialog';
import { FilterDrawer } from './filter-drawer';
import { FilterInline } from './filter-inline';
import { FilterPopover } from './filter-popover';
import { FilterSheet } from './filter-sheet';
import type { FilterVariant } from './types';

export type FilterProps = Omit<FilterProviderProps, 'children'> & {
	variant?: FilterVariant;

	// Inline variant props
	showActions?: boolean;
	contentClassName?: string;
	actionsClassName?: string;

	// Dialog/Sheet/Drawer variant props
	trigger?: ReactNode;
	title?: string;
	description?: string;
	triggerLabel?: string;
	showTriggerCount?: boolean;

	// Sheet variant props
	side?: 'top' | 'right' | 'bottom' | 'left';

	// Drawer variant props
	direction?: 'top' | 'bottom' | 'left' | 'right';

	// Popover variant props
	align?: 'start' | 'center' | 'end';
	popoverSide?: 'top' | 'right' | 'bottom' | 'left';

	// Common
	className?: string;
};

/**
 * Filter - Unified filter component with multiple layout variants
 *
 * Provides a single interface for all filter layout patterns:
 * - `dialog`: Modal popup (default) - Best for desktop, full-featured filtering
 * - `sheet`: Side sheet - Desktop-focused, persistent filtering panel
 * - `drawer`: Bottom drawer - Mobile-friendly, swipe-up interface
 * - `popover`: Compact dropdown - Space-efficient, table/list filtering
 * - `inline`: Embedded - Direct page integration, no trigger needed
 *
 * @example
 * ```tsx
 * // Dialog variant (default)
 * <Filter schema={filterSchema} onApply={handleApply} />
 *
 * // Inline variant with live updates
 * <Filter
 *   variant="inline"
 *   schema={filterSchema}
 *   liveUpdate
 *   onChange={handleChange}
 * />
 *
 * // Popover variant for compact spaces
 * <Filter
 *   variant="popover"
 *   schema={filterSchema}
 *   triggerLabel="Filter results"
 * />
 *
 * // Sheet variant with custom trigger
 * <Filter
 *   variant="sheet"
 *   schema={filterSchema}
 *   side="right"
 *   trigger={<CustomButton />}
 * />
 * ```
 */
export function Filter({
	variant = 'dialog',
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
	// Inline props
	showActions,
	contentClassName,
	actionsClassName,
	// Dialog/Sheet/Drawer props
	trigger,
	title,
	description,
	triggerLabel,
	showTriggerCount,
	// Sheet props
	side,
	// Drawer props
	direction,
	// Popover props
	align,
	popoverSide,
	// Common
	className,
}: FilterProps) {
	const commonProps = {
		schema,
		values,
		defaultValues,
		onChange,
		onApply,
		onReset,
		persistence,
		presetConfig,
		liveUpdate,
		disabled,
	};

	// Render appropriate variant
	switch (variant) {
		case 'dialog':
			return (
				<FilterDialog
					{...commonProps}
					trigger={trigger}
					title={title}
					description={description}
					triggerLabel={triggerLabel}
					showTriggerCount={showTriggerCount}
					contentClassName={contentClassName}
					actionsClassName={actionsClassName}
				/>
			);

		case 'sheet':
			return (
				<FilterSheet
					{...commonProps}
					trigger={trigger}
					title={title}
					description={description}
					triggerLabel={triggerLabel}
					showTriggerCount={showTriggerCount}
					side={side}
					contentClassName={contentClassName}
					actionsClassName={actionsClassName}
				/>
			);

		case 'drawer':
			return (
				<FilterDrawer
					{...commonProps}
					trigger={trigger}
					title={title}
					description={description}
					triggerLabel={triggerLabel}
					showTriggerCount={showTriggerCount}
					direction={direction}
					contentClassName={contentClassName}
					actionsClassName={actionsClassName}
				/>
			);

		case 'popover':
			return (
				<FilterPopover
					{...commonProps}
					trigger={trigger}
					triggerLabel={triggerLabel}
					showTriggerCount={showTriggerCount}
					align={align}
					side={popoverSide}
					contentClassName={contentClassName}
					actionsClassName={actionsClassName}
				/>
			);

		default:
			return (
				<FilterInline
					{...commonProps}
					showActions={showActions}
					contentClassName={contentClassName}
					actionsClassName={actionsClassName}
					className={className}
				/>
			);
	}
}
