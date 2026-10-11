/**
 * What keeps a repository's own configuration from running a command when this
 * plugin runs git in a directory it does not control. The runner applies it to
 * every spawn, once.
 *
 * This is a list of known keys: a repository's config cannot be disabled
 * wholesale, and `-c` beats it only for the keys named here. Re-check the list
 * when git adds config that runs commands.
 *
 * `protocol.allow` alone is not enough: a repository's own
 * `protocol.<name>.allow=always` is more specific and beats it, so the
 * per-protocol keys are named too. A partial clone's lazy fetch (a promisor
 * remote, `remote.<name>.uploadpack`) is the way a read such as `git show`
 * reaches a transport. Two more layers close it in the environment:
 * `GIT_NO_LAZY_FETCH` (git 2.44+) stops the fetch, and an empty
 * `GIT_ALLOW_PROTOCOL` allows no protocol at all whatever the
 * repository's config says, http, https, git and `<helper>::` included, which
 * covers a git older than 2.44.
 */

type Env = Record<string, string | undefined>;

export const GIT_GUARD: readonly string[] = [
	...['-c', 'core.fsmonitor=false'],
	...['-c', 'log.showSignature=false'],
	...['-c', 'core.pager=cat'],
	...['-c', 'core.hooksPath=/dev/null'],
	...['-c', 'core.sshCommand=false'],
	...['-c', 'credential.helper='],
	...['-c', 'protocol.allow=never'],
	...['-c', 'protocol.ext.allow=never'],
	...['-c', 'protocol.file.allow=never'],
	...['-c', 'protocol.ssh.allow=never'],
	'--no-optional-locks',
];

/** `git <args>` becomes `git <guard> <args>`; any other command is unchanged. Apply it once. */
export function hardenGit(argv: readonly string[]): string[] {
	return argv[0] === 'git'
		? ['git', ...GIT_GUARD, ...argv.slice(1)]
		: [...argv];
}

/** Variables that point git at another repository, other objects, other config or another program. */
const DROPPED =
	/^(?:GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_COMMON_DIR|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_EXTERNAL_DIFF|GIT_EXEC_PATH|GIT_CONFIG_SYSTEM|GIT_CONFIG_PARAMETERS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+|GIT_TRACE\w*|BUN_OPTIONS)$/;

/**
 * The environment of every child: the parent's, minus the variables above, plus
 * no pager, no prompt, no optional locks, no lazy fetch and no protocol.
 * `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` stay: the user's own
 * `user.name` is read from them.
 */
export function childEnv(base: Env): Record<string, string> {
	const kept: Record<string, string> = {};
	for (const [key, value] of Object.entries(base)) {
		if (value !== undefined && !DROPPED.test(key)) kept[key] = value;
	}
	return {
		...kept,
		GIT_PAGER: 'cat',
		GIT_TERMINAL_PROMPT: '0',
		GIT_OPTIONAL_LOCKS: '0',
		GIT_NO_LAZY_FETCH: '1',
		GIT_ALLOW_PROTOCOL: '',
		GH_PROMPT_DISABLED: '1',
	};
}
