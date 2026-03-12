import type { ActionCreatorsMapObject } from '@reduxjs/toolkit';
import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { bindActionCreators } from 'redux';

export function useActions<T extends ActionCreatorsMapObject>(
	actions: T,
	deps?: unknown[],
): T {
	const dispatch = useDispatch();
	return useMemo(
		() => {
			return bindActionCreators(actions, dispatch);
		},
		// biome-ignore lint/correctness/useExhaustiveDependencies: keep actions stable
		deps ? [dispatch, ...deps] : [dispatch],
	);
}
