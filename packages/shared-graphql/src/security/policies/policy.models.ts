import { zAccessTokenClaims } from 'stx-sdk/auth';
import z from 'zod';

export const zReqContext = z
	.object({
		body: z.unknown().optional(),
		params: z.record(z.string(), z.string()).optional(),
		query: z.record(z.string(), z.string()).optional(),
		headers: z.record(z.string(), z.string()).optional(),
		cookies: z.record(z.string(), z.string()).optional(),
	})
	.optional();

export const zRestEvaluateInput = z.object({
	type: z.literal('rest'),
	method: z.string(),
	path: z.string(),
	claims: zAccessTokenClaims,
	req: zReqContext,
	debug: z.boolean().optional(),
});

export const zGraphqlEvaluateInput = z.object({
	type: z.literal('graphql'),
	operationType: z.string(),
	field: z.string(),
	claims: zAccessTokenClaims,
	args: z.record(z.string(), z.unknown()).optional(),
	debug: z.boolean().optional(),
});

export const zEvaluateInputUnion = z.discriminatedUnion('type', [
	zRestEvaluateInput,
	zGraphqlEvaluateInput,
]);
