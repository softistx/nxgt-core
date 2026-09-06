import type { Job } from 'bullmq';
import type { EventPayload } from '../core/events.types';

// ─── Canonical payload types ──────────────────────────────────────────────────

type OrderItem = {
	article: string;
	variant?: string | null;
	quantity: number;
	batch?: string | null;
};

type OrderPayload = EventPayload<{
	order: string;
	warehouse?: string | null;
	items: Array<OrderItem>;
}>;

export type OrderConfirmedPayload = OrderPayload;

export type OrderShippedPayload = OrderPayload;

export type OrderCancelledPayload = EventPayload<{
	order: string;
}>;

export type OrderReturnedPayload = OrderPayload;

type PurchaseReceivedItem = {
	article: string;
	quantity: number;
	warehouse?: string | null;
	batchNumber?: string | null;
	expiryDate?: string | null;
	unitCost?: number | null;
};

export type PurchaseReceivedPayload = EventPayload<{
	purchase: string;
	supplier: string;
	warehouse?: string | null;
	currency?: string | null;
	items: Array<PurchaseReceivedItem>;
}>;

// ─── Event name constants ─────────────────────────────────────────────────────

export const SALES_EVENT_NAMES = {
	ORDER_CONFIRMED: 'order.confirmed',
	ORDER_SHIPPED: 'order.shipped',
	ORDER_CANCELLED: 'order.cancelled',
	ORDER_RETURNED: 'order.returned',
	PURCHASE_RECEIVED: 'purchase.received',
} as const;

export type SalesEventName =
	(typeof SALES_EVENT_NAMES)[keyof typeof SALES_EVENT_NAMES];

export type SalesEventJob = Job<
	| OrderConfirmedPayload
	| OrderShippedPayload
	| OrderCancelledPayload
	| OrderReturnedPayload
	| PurchaseReceivedPayload,
	void,
	SalesEventName
>;
