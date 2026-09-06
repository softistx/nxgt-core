import type { Job } from 'bullmq';
import type { EventPayload } from '../core/events.types';

// ─── Canonical payload types ──────────────────────────────────────────────────

export type PatientCreatedPayload = EventPayload<{
	patientId: string;
	mrn: string;
	firstName: string;
	lastName: string;
	email?: string | null;
	phone?: string | null;
}>;

export type CustomerProvisionedPayload = EventPayload<{
	patientId: string;
	customerId: string;
}>;

// ─── Event name constants ─────────────────────────────────────────────────────

export const ENTITIES_EVENT_NAMES = {
	PATIENT_CREATED: 'patient.created',
	CUSTOMER_PROVISIONED: 'customer.provisioned',
} as const;

// ─── Job types ──────────────────────────────────────────────────────────────
//
// Two distinct queues, one per direction — a BullMQ Worker competes for every
// job on the queue name it's attached to regardless of job name, so `health`
// and `platform` cannot share one queue for both event types without racing
// each other for jobs meant for the other side. See `entities.queues.ts`.

export type PatientEventJob = Job<
	PatientCreatedPayload,
	void,
	typeof ENTITIES_EVENT_NAMES.PATIENT_CREATED
>;

export type CustomerEventJob = Job<
	CustomerProvisionedPayload,
	void,
	typeof ENTITIES_EVENT_NAMES.CUSTOMER_PROVISIONED
>;
