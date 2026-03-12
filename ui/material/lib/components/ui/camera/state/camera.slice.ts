import type { ReducerCreators } from '@reduxjs/toolkit';
import { createAsyncSlice } from '../../../../lib';
import { DEFAULT_CAPTURE_SETTINGS } from '../consts';
import type { CameraAlert, CameraState } from '../types';
import { createCapturePhotoReducer } from './camera.reducers';
import {
	createRequestPermissionThunk,
	createStartStreamThunk,
} from './camera.thunks';

const createInitialState = (
	_overrides?: Partial<CameraState>,
): CameraState => ({
	devices: [],
	selectedDeviceId: null,
	hasPermission: false,
	isStreaming: false,
	isProcessing: false,
	cameraSupported: false,

	capturedImage: null,
	captureSettings: { ...DEFAULT_CAPTURE_SETTINGS },

	alert: null,
});

export const cameraSlice = createAsyncSlice({
	name: 'camera',
	initialState: createInitialState(),
	reducers: (create) => {
		return {
			setDevices: create.reducer<Array<MediaDeviceInfo>>((state, action) => {
				state.devices = action.payload;
			}),
			selectDevice: create.reducer<string | null>((state, action) => {
				state.selectedDeviceId = action.payload;
			}),
			setPermission: create.reducer<boolean>((state, action) => {
				state.hasPermission = action.payload;
			}),
			setStreaming: create.reducer<boolean>((state, action) => {
				state.isStreaming = action.payload;
			}),
			setAlert: create.reducer<CameraAlert | null>((state, action) => {
				state.alert = action.payload;
			}),
			setCameraSupported: create.reducer<boolean>((state, action) => {
				state.cameraSupported = action.payload;
			}),
			capturePhoto: createCapturePhotoReducer(create),
			requestPermission: createRequestPermissionThunk(create),
			startStream: createStartStreamThunk(create),
		} as const;
	},
});

type CameraSliceActions = typeof cameraSlice.actions;

export type CameraActions = {
	[K in keyof CameraSliceActions]: (
		...args: Parameters<CameraSliceActions[K]>
	) => void;
};

export type CameraReducerCreators = ReducerCreators<CameraState>;
