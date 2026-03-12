import { configureStore } from '@reduxjs/toolkit';
import { useSelector } from 'react-redux';
import { useActions } from '../../../../lib';
import type { CameraState } from '../types';
import { cameraSlice } from './camera.slice';

export const store = configureStore({
	reducer: cameraSlice.reducer,
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware({
			serializableCheck: {
				ignoredActions: ['camera/capturePhoto'],
			},
		}),
});

export const useCameraActions = () => useActions(cameraSlice.actions);
export const useCameraSelector = useSelector.withTypes<CameraState>();
