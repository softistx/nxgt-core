import type { CaptureSettings } from './types';

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
	resolution: { width: 1920, height: 1080 },
	quality: 0.9,
	format: 'jpeg',
	mirror: false,
};
