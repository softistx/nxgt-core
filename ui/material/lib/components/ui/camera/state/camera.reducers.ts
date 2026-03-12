import type { CameraReducerCreators } from './camera.slice';

export const createCapturePhotoReducer = (create: CameraReducerCreators) =>
	create.reducer<HTMLVideoElement | null>((state, action) => {
		const video = action.payload;
		if (!state.isStreaming || !video || !document) return;

		try {
			state.isProcessing = true;

			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');

			if (!ctx) throw new Error('Failed to get canvas context');

			canvas.width = state.captureSettings.resolution.width;
			canvas.height = state.captureSettings.resolution.height;

			// Draw video frame to canvas
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

			// Apply mirror if enabled
			if (state.captureSettings.mirror) {
				ctx.scale(-1, 1);
				ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
				ctx.scale(-1, 1); // Reset scale
			}

			const imageData = canvas.toDataURL(
				`image/${state.captureSettings.format}`,
				state.captureSettings.quality,
			);

			state.capturedImage = imageData;
		} catch (error) {
			state.alert = {
				message: 'Failed to capture photo',
				type: 'error',
			};
			console.error('Capture Photo Error:', error);
		} finally {
			state.isProcessing = false;
		}
	});
