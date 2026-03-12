import type {
	CaseReducerActions,
	Slice,
	SliceCaseReducers,
	SliceSelectors,
} from '@reduxjs/toolkit';
import { useMemo, useReducer } from 'react';

export function useSliceReducer<
	State,
	CaseReducers extends SliceCaseReducers<State>,
	Name extends string,
	Selectors extends SliceSelectors<State>,
	ReducerPath extends string = Name,
>(slice: Slice<State, CaseReducers, Name, ReducerPath, Selectors>) {
	const [state, dispatch] = useReducer(slice.reducer, slice.getInitialState());

	// biome-ignore lint/correctness/useExhaustiveDependencies: keep slice stable
	const actions = useMemo(() => {
		const boundActions: {
			[K in keyof CaseReducerActions<CaseReducers, Name>]: (
				...args: Parameters<CaseReducerActions<CaseReducers, Name>[K]>
			) => void;
		} = {} as any;

		for (const key in slice.actions) {
			boundActions[key as keyof CaseReducers] = (...args: any[]) => {
				dispatch(slice.actions[key](...args));
			};
		}

		return boundActions;
	}, [dispatch, slice.actions]);

	return [state, actions] as const;
}
