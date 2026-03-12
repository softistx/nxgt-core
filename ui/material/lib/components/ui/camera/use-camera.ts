import { useContext, useEffect } from 'react';
import { CameraContext } from './camera.provider';

export function useCamera() {
	const { streamRef, videoRef, canvasRef, state, actions } =
		useContext(CameraContext);

	useEffect(() => {
		actions.requestPermission();
	}, [actions]);

	useEffect(() => {
		return () => {
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((track) => {
					track.stop();
				});
			}
		};
	}, [streamRef]);

	return {
		videoRef,
		canvasRef,
		streamRef,
		state,
		actions,
	};
}
