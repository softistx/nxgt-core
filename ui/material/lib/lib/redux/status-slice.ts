import {
	createSlice,
	type PayloadAction,
	type SliceCaseReducers,
	type SliceSelectors,
	type ValidateSliceCaseReducers,
} from '@reduxjs/toolkit';
import type { Status } from '../../models';

export const createStatusSlice = <
	T,
	Reducers extends SliceCaseReducers<Status<T>>,
	Selectors extends SliceSelectors<Status<T>>,
	Name extends string,
>({
	name,
	initialState = { status: 'idle' } as Status<T>,
	reducers = {} as ValidateSliceCaseReducers<Status<T>, Reducers>,
	selectors = {} as Selectors,
}: {
	name: Name;
	initialState?: Status<T>;
	reducers?: ValidateSliceCaseReducers<Status<T>, Reducers>;
	selectors?: Selectors;
}) => {
	return createSlice({
		name,
		initialState,
		reducers: {
			reset(state) {
				state.status = initialState.status;
			},
			start(state) {
				state.status = 'loading';
			},
			success(state: Status<T>, action: PayloadAction<T>) {
				state.data = action.payload;
				state.status = 'success';
			},
			error(state: Status<T>, action: PayloadAction<string>) {
				state.error = action.payload;
				state.status = 'error';
			},
			...reducers,
		},
		selectors: {
			...selectors,
		},
	});
};

type InferValue<T> = T extends Status<infer V> ? V : never;

export const createStatusesSlice = <
	T extends Record<string, Status<any>>,
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
}) => {
	return createSlice({
		name,
		initialState,
		reducers: {
			reset<K extends keyof T>(state: T, action: PayloadAction<K>) {
				state[action.payload] = initialState[action.payload];
			},
			start<K extends keyof T>(state: T, action: PayloadAction<K>) {
				state[action.payload].status = 'loading';
			},
			success<K extends keyof T>(
				state: T,
				action: PayloadAction<{ path: K; data: InferValue<T[K]> }>,
			) {
				const path = action.payload.path;
				state[path].data = action.payload.data;
				state[path].status = 'success';
			},
			error<K extends keyof T>(
				state: T,
				action: PayloadAction<{ path: K; message: string }>,
			) {
				const path = action.payload.path;
				state[path].error = action.payload.message;
				state[path].status = 'error';
			},
			...reducers,
		},
		selectors: {
			...selectors,
			status<K extends keyof T>(state: T, path: K) {
				return state[path].status;
			},
		},
	});
};
