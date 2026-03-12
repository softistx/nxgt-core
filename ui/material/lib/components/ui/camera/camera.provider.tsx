import { createContext, type PropsWithChildren, useMemo, useRef } from 'react';
import { cameraSlice, useCameraActions, useCameraSelector } from './state';
import type { CameraContextValue } from './types';

export const CameraContext = createContext<CameraContextValue>({
	videoRef: { current: null },
	canvasRef: { current: null },
	streamRef: { current: null },
	state: cameraSlice.getInitialState(),
	actions: {} as CameraContextValue['actions'],
});

type CameraProviderProps = PropsWithChildren;

export function CameraProvider({ children }: CameraProviderProps) {
	const streamRef = useRef<MediaStream | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const state = useCameraSelector((state) => state);
	const actions = useCameraActions();

	const contextActions = useMemo(
		() => ({
			...actions,
			startStream: () => {
				actions.startStream((stream) => {
					streamRef.current = stream;
					if (videoRef.current) {
						videoRef.current.srcObject = stream;
					}
				});
			},
			stopStream: () => {
				if (streamRef.current) {
					streamRef.current.getTracks().forEach((track) => {
						track.stop();
					});
					streamRef.current = null;
				}
				actions.setStreaming(false);
			},
			capturePhoto: () => {
				actions.capturePhoto(videoRef.current);
			},
		}),
		[actions],
	);

	return (
		<CameraContext.Provider
			value={{
				videoRef,
				canvasRef,
				streamRef,
				state,
				actions: contextActions,
			}}
		>
			{children}
		</CameraContext.Provider>
	);
}
