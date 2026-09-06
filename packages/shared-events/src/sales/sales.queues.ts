import { createQueue } from '../core/events.utils';

export const QUEUE_SALES_EVENTS = 'sales-events';

export function createSalesEventsQueue(redisUrl: string) {
	return createQueue(QUEUE_SALES_EVENTS, {
		connection: { url: redisUrl },
	});
}
