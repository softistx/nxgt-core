import { createRedisEventTarget } from '@graphql-yoga/redis-event-target';
import { createPubSub } from 'graphql-yoga';
import type { Redis } from 'ioredis';

export const createYogaPubSub = ({
	publishClient,
	subscribeClient,
}: {
	publishClient: Redis;
	subscribeClient: Redis;
}) => {
	const eventTarget = createRedisEventTarget({
		publishClient,
		subscribeClient,
	});

	return createPubSub({ eventTarget });
};
