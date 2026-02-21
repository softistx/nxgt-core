import type { LocaleKey } from '@nxgt/i18n';
import type { StatusCode } from './status';

export class CustomException<T extends string = LocaleKey> extends Error {
	code: StatusCode;
	debugMessage?: string;
	options?: any;

	constructor(
		message?: T,
		code: StatusCode = 400,
		options?: object,
		debugMessage?: string,
	) {
		super(message);
		this.code = code;
		this.debugMessage = debugMessage;
		this.options = options;
	}

	static from<T extends string = LocaleKey>({
		message,
		code,
		options,
		debugMessage,
	}: ErrorProps<T> & {
		code?: StatusCode;
	}) {
		return new CustomException(message, code ?? 400, options, debugMessage);
	}

	static badRequest<T extends string = LocaleKey>({
		message,
		options,
		debugMessage,
	}: ErrorProps<T>) {
		return new CustomException(message, 400, options, debugMessage);
	}

	static notFound<T extends string = LocaleKey>({
		message,
		options,
		debugMessage,
	}: ErrorProps<T>) {
		return new CustomException(message, 404, options, debugMessage);
	}

	static internal<T extends string = LocaleKey>({
		message,
		options,
		debugMessage,
	}: ErrorProps<T>) {
		return new CustomException(message, 500, options, debugMessage);
	}

	static unauthorized<T extends string = LocaleKey>({
		message,
		options,
		debugMessage,
	}: ErrorProps<T>) {
		return new CustomException(message, 401, options, debugMessage);
	}

	static forbidden<T extends string = LocaleKey>({
		message,
		options,
		debugMessage,
	}: ErrorProps<T>) {
		return new CustomException(message, 403, options, debugMessage);
	}

	static conflict<T extends string = LocaleKey>({
		message,
		options,
		debugMessage,
	}: ErrorProps<T>) {
		return new CustomException(message, 409, options, debugMessage);
	}
}

export type ErrorProps<T extends string = LocaleKey> = {
	message: T;
	options?: object;
	debugMessage?: string;
};
