import { html } from 'hono/html';

export type RenderSandboxOptions = {
	port?: number;
	graphqlEndpoint?: string;
	protocol?: string;
	hostname?: string;
	title?: string;
	/**
	 * The whole URL the Sandbox starts at. `sandboxExplorer` sets it from
	 * the request when neither `port`, `hostname` nor `protocol` is given,
	 * so the page asks the server it was served by — a proxy, HTTPS and a
	 * prefix included — and not `localhost:8080`.
	 */
	initialEndpoint?: string;
};

/** `graphqlEndpoint` without its leading slashes: it is joined after one. */
const path = (endpoint: string) => endpoint.replace(/^\/+/, '');

/**
 * The URL the Sandbox starts at: `initialEndpoint`, else the one `port`,
 * `hostname` and `protocol` compose — `http://localhost:8080/graphql` by
 * default, as before 3.1.
 */
export const sandboxEndpoint = ({
	initialEndpoint,
	port = 8080,
	hostname = 'localhost',
	graphqlEndpoint = 'graphql',
	protocol = 'http',
}: RenderSandboxOptions): string =>
	initialEndpoint ??
	`${protocol}://${hostname}:${port}/${path(graphqlEndpoint)}`;

export const renderSandbox = ({
	title = 'Sandbox Explorer',
	...options
}: RenderSandboxOptions) => html`
<title>${title}</title>
<div id="sandbox" style="position:absolute;top:0;right:0;bottom:0;left:0"></div>
<script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
<script>
    new window.EmbeddedSandbox({
        target: "#sandbox",
        // Pass through your server href if you are embedding on an endpoint.
        // Otherwise, you can pass whatever endpoint you want Sandbox to start up with here.
        initialEndpoint: "${sandboxEndpoint(options)}",
        handleRequest: (endpointUrl, options) => {
            return fetch(endpointUrl, {
                ...options,
                headers: {
                    ...options.headers
                },
            })
        },
        hideCookieToggle: true,
    });
    // advanced options: https://www.apollographql.com/docs/studio/explorer/sandbox#embedding-sandbox
</script>

`;
