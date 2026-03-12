import { pick } from 'lodash';
import type { CameraDeviceInfo } from '../types';

export * from './camera.utils';

/**
 * Get available camera devices
 */
export async function getCameraDevices(): Promise<CameraDeviceInfo[]> {
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((device) => device.kind === 'videoinput')
			.map((device) => pick(device, ['deviceId', 'label', 'groupId']));
	} catch (error) {
		console.error('Failed to enumerate camera devices:', error);
		return [];
	}
}

/**
 * Request camera permissions
 */
export async function requestCameraPermissions(): Promise<boolean> {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: false,
		});
		// Stop the stream immediately after getting permission
		stream.getTracks().forEach((track) => {
			track.stop();
		});
		return true;
	} catch (error) {
		console.error('Camera permission denied:', error);
		return false;
	}
}

/**
 * Check if camera is supported
 */
export function isCameraSupported(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		'mediaDevices' in navigator &&
		'getUserMedia' in navigator.mediaDevices &&
		'enumerateDevices' in navigator.mediaDevices
	);
}
