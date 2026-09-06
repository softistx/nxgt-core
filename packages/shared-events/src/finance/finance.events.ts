import type { Job } from 'bullmq';
import type { EventPayload } from '../core/events.types';

// ─── Canonical payload types ──────────────────────────────────────────────────

export type InvoiceCreatedPayload = EventPayload<{
	invoice: string;
	type: 'SALES' | 'PURCHASE';
	sourceType: 'ORDER' | 'PURCHASE' | 'MANUAL';
	sourceId?: string | null;
	partyId?: string | null;
	totalAmount: number;
	currency: string;
}>;

export type InvoicePostedPayload = EventPayload<{
	invoice: string;
	type: 'SALES' | 'PURCHASE';
	totalAmount: number;
	currency: string;
}>;

export type InvoicePaidPayload = EventPayload<{
	invoice: string;
}>;

export type PaymentCreatedPayload = EventPayload<{
	payment: string;
	invoice: string;
	amount: number;
	currency: string;
}>;

export type PayrollPostedPayload = EventPayload<{
	payrollBatch: string;
	totalNet: number;
	currency: string;
}>;

// ─── Event name constants ─────────────────────────────────────────────────────

export const FINANCE_EVENT_NAMES = {
	INVOICE_CREATED: 'invoice.created',
	INVOICE_POSTED: 'invoice.posted',
	INVOICE_PAID: 'invoice.paid',
	PAYMENT_CREATED: 'payment.created',
	PAYROLL_POSTED: 'payroll.posted',
} as const;

export type FinanceEventName =
	(typeof FINANCE_EVENT_NAMES)[keyof typeof FINANCE_EVENT_NAMES];

export type FinanceEventJob = Job<
	| InvoiceCreatedPayload
	| InvoicePostedPayload
	| InvoicePaidPayload
	| PaymentCreatedPayload
	| PayrollPostedPayload,
	void,
	FinanceEventName
>;
