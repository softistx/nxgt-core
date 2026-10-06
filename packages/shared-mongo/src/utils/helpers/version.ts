import { CustomException } from '@nxgt/shared-exceptions';
import { isNil } from 'lodash';

export function checkVersion(modelVersion: number, version?: number) {
	if (isNil(version)) {
		return;
	}
	if (modelVersion !== version) {
		throw CustomException.badRequest({
			message: 'errors.optimistic-lock-failed',
		});
	}
}
