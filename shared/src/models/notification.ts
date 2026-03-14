import z from 'zod';

export const zNotificationPriority = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const zDeliveryChannel = z.enum(['IN_APP', 'EMAIL', 'PUSH', 'SMS']);

export const zCreateNotificationRequest = z.object({
	recipient: z.string(),
	type: z.string(),
	title: z.optional(z.string()),
	message: z.optional(z.string()),
	template: z.optional(z.string()),
	metadata: z.optional(z.record(z.string(), z.unknown())),
	priority: z.optional(zNotificationPriority),
	deliveryChannels: z.optional(z.array(zDeliveryChannel)),
});

export type NotificationPriority = z.infer<typeof zNotificationPriority>;
export type DeliveryChannel = z.infer<typeof zDeliveryChannel>;
export type CreateNotificationRequest = z.infer<
	typeof zCreateNotificationRequest
>;
