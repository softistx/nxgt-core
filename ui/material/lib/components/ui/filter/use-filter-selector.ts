'use client';

import { useSliceSelector } from '../../../lib';
import type { FilterState } from './types';

/**
 * Custom hook for using filter selectors with automatic memoization
 *
 * @example
 * ```typescript
 * const activeCount = useFilterSelector(state, filterSelectors.selectActiveFilterCount);
 * const canApply = useFilterSelector(state, filterSelectors.selectCanApply);
 * ```
 */
export function useFilterSelector<T>(
	state: FilterState,
	selector: (state: FilterState) => T,
): T {
	return useSliceSelector(state, selector);
}
