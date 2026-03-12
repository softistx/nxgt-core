import type { AsyncRejected } from '../../../../lib';
import {
	getCameraDevices,
	isCameraSupported,
	requestCameraPermissions,
} from '../utils';
import type { CameraReducerCreators } from './camera.slice';

export const createRequestPermissionThunk = (create: CameraReducerCreators) => {
	const createAsyncThunk = create.asyncThunk.withTypes<AsyncRejected>();

	return createAsyncThunk(
		async (_, { rejectWithValue }) => {
			console.info('Checking camera support and requesting permissions...');
			const cameraSupported = isCameraSupported();
			if (!cameraSupported) {
				console.warn('Camera not supported in this browser');
				return { hasPermission: false, devices: [], cameraSupported };
			}
			try {
				const hasPermission = await requestCameraPermissions();
				console.info('Camera permission status:', hasPermission);
				const devices = hasPermission ? await getCameraDevices() : [];
				return { hasPermission, devices, cameraSupported };
			} catch (_error) {
				console.error('Error requesting camera permissions:', _error);
				throw rejectWithValue({
					message: 'Failed to request camera permissions',
				});
			}
		},
		{
			pending: (state) => {
				state.isProcessing = true;
			},
			fulfilled: (state, action) => {
				state.cameraSupported = action.payload.cameraSupported;
				state.hasPermission = action.payload.hasPermission;
				state.devices = action.payload.devices;
				if (state.devices.length > 0 && !state.selectedDeviceId) {
					state.selectedDeviceId = state.devices[0].deviceId;
				}
				state.alert = null;
				state.isProcessing = false;
			},
			rejected: (state, action) => {
				state.alert = {
					message: action.payload?.message || '',
					type: 'error',
				};
				state.isProcessing = false;
			},
		},
	);
};

export const createStartStreamThunk = (create: CameraReducerCreators) => {
	const createAsyncThunk = create.asyncThunk.withTypes<AsyncRejected>();

	return createAsyncThunk(
		async (onSuccess: (stream: MediaStream) => void, { rejectWithValue }) => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: true,
				});
				onSuccess(stream);
			} catch (_error) {
				throw rejectWithValue({
					message: 'Failed to start camera stream',
				});
			}
		},
		{
			pending: (state) => {
				state.isProcessing = true;
			},
			fulfilled: (state) => {
				state.isStreaming = true;
				state.alert = null;
				state.isProcessing = false;
			},
			rejected: (state, action) => {
				state.alert = {
					message: action.payload?.message || '',
					type: 'error',
				};
				state.isProcessing = false;
			},
		},
	);
};
