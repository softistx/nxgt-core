import { createQueue } from '../core/events.utils';

// One queue per direction — see the comment in `entities.events.ts` for why
// `patient.created` and `customer.provisioned` cannot share a single queue.

export const QUEUE_PATIENT_EVENTS = 'patient-events';
export const QUEUE_CUSTOMER_EVENTS = 'customer-events';

export function createPatientEventsQueue(redisUrl: string) {
	return createQueue(QUEUE_PATIENT_EVENTS, {
		connection: { url: redisUrl },
	});
}

export function createCustomerEventsQueue(redisUrl: string) {
	return createQueue(QUEUE_CUSTOMER_EVENTS, {
		connection: { url: redisUrl },
	});
}
