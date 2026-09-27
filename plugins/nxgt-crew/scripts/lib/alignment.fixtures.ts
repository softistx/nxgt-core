/** Sessions, plans and a roadmap shared by the alignment specs. */

import { announce } from './announcements';
import { NOW, record } from './fixtures';
import type { PlanFields, SessionRecord } from './record';
import { parseRoadmap } from './roadmap';

export const ROADMAP = `# Roadmap

Intro text with - a dash that is not an item.

## Now

- **janus-mail transport** — send through @nxgt/mail
- [ ] OAuth2 device flow: for CLIs

## Next

* \`retry\` policy - backoff for the store

\`\`\`md
- not an entry
\`\`\`

## Shipped

- **Store failures** — one StoreFailure
`;

export const plan = (
	r: SessionRecord,
	entry: string,
	fields: PlanFields = {},
	at = NOW,
) => announce(r, `planning ${entry}`, 'plan', at, { entry, ...fields });

export const janus = record('janus-1111', {
	title: 'janus',
	worktree: '/w/nxgt-janus',
	remote: 'git@github.com:softistx/nxgt-janus.git',
});
export const mail = record('mail-2222', {
	title: 'mail',
	worktree: '/w/nxgt-mail',
	remote: 'https://github.com/softistx/nxgt-mail',
});
export const janusRoadmap = {
	path: '/w/nxgt-janus/packages/janus-mail/docs/roadmap.md',
	scope: '@nxgt/janus-mail',
	entries: parseRoadmap(ROADMAP),
};
