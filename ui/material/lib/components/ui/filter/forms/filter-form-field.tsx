'use client';

import { type Control, Controller, type Path } from 'react-hook-form';
import { FilterDialog } from '../filter-dialog';
import { FilterDrawer } from '../filter-drawer';
import { FilterInline } from '../filter-inline';
import { FilterPopover } from '../filter-popover';
import { FilterSheet } from '../filter-sheet';
import type { FilterSchema, FilterValues, FilterVariant } from '../types';

export type FilterFormFieldProps<T extends Record<string, any>> = {
	control: Control<T>;
	name: Path<T>;
	schema: FilterSchema;
	variant?: FilterVariant;
	disabled?: boolean;

	// Inline variant props
	showActions?: boolean;
	contentClassName?: string;
	actionsClassName?: string;

	// Dialog variant props
	trigger?: React.ReactNode;
	title?: string;
	description?: string;
	triggerLabel?: string;
	showTriggerCount?: boolean;

	// Sheet/Drawer variant props
	side?: 'top' | 'right' | 'bottom' | 'left';

	// Common filter props
	liveUpdate?: boolean;
	className?: string;
};

/**
 * FilterFormField - React Hook Form integration for Filter component
 *
 * Provides seamless integration between Filter components and React Hook Form,
 * supporting all filter variants (inline, dialog, sheet, drawer, popover).
 *
 * @example
 * ```tsx
 * import { useForm } from 'react-hook-form';
 * import { FilterFormField } from '..';
 *
 * function MyForm() {
 *   const { control, handleSubmit } = useForm({
 *     defaultValues: {
 *       filters: {}
 *     }
 *   });
 *
 *   return (
 *     <form onSubmit={handleSubmit(console.log)}>
 *       <FilterFormField
 *         control={control}
 *         name="filters"
 *         schema={filterSchema}
 *         variant="dialog"
 *       />
 *     </form>
 *   );
 * }
 * ```
 */
export function FilterFormField<T extends Record<string, any>>({
	control,
	name,
	schema,
	variant = 'inline',
	disabled,
	// Inline props
	showActions,
	contentClassName,
	actionsClassName,
	// Dialog props
	trigger,
	title,
	description,
	triggerLabel,
	showTriggerCount,
	// Sheet/Drawer props
	side,
	// Common props
	liveUpdate,
	className,
}: FilterFormFieldProps<T>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field }) => {
				const commonProps = {
					schema,
					values: (field.value as FilterValues) || {},
					onChange: (values: FilterValues) => {
						field.onChange(values);
						if (liveUpdate) {
							field.onBlur();
						}
					},
					onApply: (values: FilterValues) => {
						field.onChange(values);
						field.onBlur();
					},
					liveUpdate,
					disabled: disabled || field.disabled,
					className,
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
							/>
						);
				}
			}}
		/>
	);
}
