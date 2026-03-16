import { Cron, type CronCallback, type CronOptions } from 'croner';

export function croner<T>(
	pattern: string,
	options1?: CronOptions<T> | CronCallback<T>,
	options2?: CronOptions<T> | CronCallback<T>,
) {
	return new Cron(pattern, options1, options2);
}
