import { html } from 'hono/html';

export type RenderSandboxOptions = {
	port?: number;
	graphqlEndpoint?: string;
	protocol?: string;
	hostname?: string;
	title?: string;
};

export const renderSandbox = ({
	port = 8080,
	hostname = 'localhost',
	graphqlEndpoint = 'graphql',
	protocol = 'http',
	title = 'Sandbox Explorer',
}: RenderSandboxOptions) => html`
<title>${title}</title>
<div id="sandbox" style="position:absolute;top:0;right:0;bottom:0;left:0"></div>
<script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
<script>
    new window.EmbeddedSandbox({
        target: "#sandbox",
        // Pass through your server href if you are embedding on an endpoint.
        // Otherwise, you can pass whatever endpoint you want Sandbox to start up with here.
        initialEndpoint: "${protocol}://${hostname}:${port}/${graphqlEndpoint}",
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
