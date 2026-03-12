import type { CameraActions } from './state';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export type CaptureSettings = {
	resolution: { width: number; height: number };
	quality: number; // 0-1
	format: ImageFormat;
	mirror: boolean;
};

export type CameraAlert = {
	message: string;
	type: 'success' | 'warn' | 'error' | 'info';
};

export type CameraDeviceInfo = Pick<
	MediaDeviceInfo,
	'deviceId' | 'label' | 'groupId'
>;

export type CameraState = {
	devices: CameraDeviceInfo[];
	selectedDeviceId: string | null;
	hasPermission: boolean;
	isStreaming: boolean;
	isProcessing: boolean;
	cameraSupported: boolean;

	capturedImage: string | null;
	captureSettings: CaptureSettings;

	alert: CameraAlert | null;
};

export type CameraContextValue = {
	videoRef: React.RefObject<HTMLVideoElement | null>;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	streamRef: React.RefObject<MediaStream | null>;
	state: CameraState;
	actions: Omit<CameraActions, 'startStream' | 'capturePhoto'> & {
		capturePhoto: () => void;
		startStream: () => void;
		stopStream: () => void;
	};
};
