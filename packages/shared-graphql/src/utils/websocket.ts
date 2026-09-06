import { createServer } from 'node:http';
import type { ServerOptions } from 'graphql-ws';
import { useServer } from 'graphql-ws/use/ws';
import type { YogaServerInstance } from 'graphql-yoga';
import { WebSocketServer } from 'ws';

export function setupYogaWebSocketServer<
	ServerContext extends {},
	UserContext extends {},
>({
	yoga,
	context,
}: {
	yoga: YogaServerInstance<ServerContext, UserContext>;
	context?: ServerOptions['context'];
}) {
	const httpServer = createServer(yoga);
	const wsServer = new WebSocketServer({
		server: httpServer,
		path: yoga.graphqlEndpoint,
	});

	// biome-ignore lint/correctness/useHookAtTopLevel: Not react related
	useServer(
		{
			execute: (args: any) => args.rootValue.execute(args),
			subscribe: (args: any) => args.rootValue.subscribe(args),
			onSubscribe: async (ctx, _id, params) => {
				const { schema, execute, subscribe, contextFactory, parse, validate } =
					yoga.getEnveloped({
						...ctx,
						req: ctx.extra.request,
						socket: ctx.extra.socket,
						params,
					});

				const args = {
					schema,
					operationName: params.operationName,
					document: parse(params.query),
					variableValues: params.variables,
					contextValue: await contextFactory(),
					rootValue: {
						execute,
						subscribe,
					},
				};

				const errors = validate(args.schema, args.document);
				if (errors.length) return errors;
				return args;
			},
			context,
		},
		wsServer,
	);

	const startServer = (port: number) =>
		new Promise<void>((resolve) => httpServer.listen({ port }, resolve));
	return { yoga, httpServer, startServer };
}
