import { logger } from '../logging';

export function buildStaticFilesRoutes(
	paths: string[],
	base: string = 'public',
) {
	return paths.reduce(
		(routes: Record<string, (req: Request) => Response>, path) => {
			routes[`/${path}`] = (_req: Request) => {
				logger.info(`Serving static file: ${path}`);
				return new Response(
					Bun.file(
						`${base.startsWith('/') ? base.substring(1) : base}/${path}`.replace(
							'//',
							'/',
						),
					),
				);
			};
			return routes;
		},
		{},
	);
}
