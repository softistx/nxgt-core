'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type {
	FilterContextValue,
	FilterPersistenceConfig,
	FilterPresetConfig,
	FilterSchema,
	FilterValues,
} from './types';
import { type UseFilterOptions, useFilter } from './use-filter';

const FilterContext = createContext<FilterContextValue | null>(null);

export type FilterProviderProps = {
	children: ReactNode;
	schema: FilterSchema;
	values?: FilterValues;
	defaultValues?: FilterValues;
	onChange?: (values: FilterValues) => void;
	onApply?: (values: FilterValues) => void;
	onReset?: () => void;
	persistence?: FilterPersistenceConfig;
	presetConfig?: FilterPresetConfig;
	liveUpdate?: boolean;
	disabled?: boolean;
};

/**
 * FilterProvider - Provides filter state and actions through context
 *
 * This component wraps the filter UI and makes state and actions available to all
 * nested components without prop drilling.
 *
 * @example
 * ```tsx
 * <FilterProvider schema={filterSchema} onApply={(values) => console.log(values)}>
 *   <FilterContent />
 *   <FilterActions />
 *   <FilterChips />
 * </FilterProvider>
 * ```
 */
export function FilterProvider({
	children,
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
}: FilterProviderProps) {
	const options: UseFilterOptions = useMemo(
		() => ({
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
		}),
		[
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
		],
	);

	const filterData = useFilter(options);

	const value: FilterContextValue = useMemo(
		() => ({
			state: filterData.state,
			actions: filterData.actions,
			schema: filterData.schema,
			persistence: filterData.persistence,
			presetConfig: filterData.presetConfig,
			activeFilterCount: filterData.activeFilterCount,
			hasActiveFilters: filterData.hasActiveFilters,
			hasErrors: filterData.hasErrors,
			canApply: filterData.canApply,
			canReset: filterData.canReset,
		}),
		[filterData],
	);

	return (
		<FilterContext.Provider value={value}>{children}</FilterContext.Provider>
	);
}

/**
 * useFilterContext - Hook to access filter state and actions
 *
 * Must be used within a FilterProvider.
 *
 * @throws Error if used outside of FilterProvider
 *
 * @example
 * ```tsx
 * function CustomFilterComponent() {
 *   const { state, actions } = useFilterContext();
 *
 *   return (
 *     <button onClick={actions.applyFilters}>
 *       Apply {state.isDirty ? '(unsaved)' : ''}
 *     </button>
 *   );
 * }
 * ```
 */
export function useFilterContext(): FilterContextValue {
	const context = useContext(FilterContext);

	if (!context) {
		throw new Error('useFilterContext must be used within a FilterProvider');
	}

	return context;
}
