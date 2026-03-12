import {
	createSlice,
	type PayloadAction,
	type SliceCaseReducers,
	type SliceSelectors,
	type ValidateSliceCaseReducers,
} from '@reduxjs/toolkit';

export function createSliceWithFilter<
	T extends { filter?: any; sort?: any },
	Reducers extends SliceCaseReducers<T>,
	Selectors extends SliceSelectors<T>,
	Name extends string,
>({
	name,
	initialState,
	reducers = {} as ValidateSliceCaseReducers<T, Reducers>,
	selectors = {} as Selectors,
}: {
	name: Name;
	initialState: T;
	reducers?: ValidateSliceCaseReducers<T, Reducers>;
	selectors?: Selectors;
}) {
	return createSlice({
		name,
		initialState,
		reducers: {
			updateFilter(state, action: PayloadAction<Pick<T, 'filter' | 'sort'>>) {
				const { filter, sort } = action.payload;
				if (filter) {
					state.filter = { ...state.filter, ...filter };
				}
				if (sort) {
					state.sort = { ...state.sort, ...sort };
				}
			},
			resetFilter(state) {
				state.filter = initialState.filter;
				state.sort = initialState.sort;
			},
			...reducers,
		},
		selectors: {
			...selectors,
		},
	});
}
