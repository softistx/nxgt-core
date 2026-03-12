'use client';

import { useMemo } from 'react';

/**
 *
 *
 */
export function useSliceSelector<S, T>(state: S, selector: (state: S) => T): T {
	return useMemo(() => selector(state), [state, selector]);
}
