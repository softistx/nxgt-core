import { createQueue } from '../core/events.utils';

export const QUEUE_FINANCE_EVENTS = 'finance-events';

export function createFinanceEventsQueue(redisUrl: string) {
	return createQueue(QUEUE_FINANCE_EVENTS, {
		connection: { url: redisUrl },
	});
}
