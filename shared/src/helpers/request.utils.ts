import { z } from 'zod';

export const PARAMS = {
	id: z.object({ id: z.string() }).required({ id: true }),
};
