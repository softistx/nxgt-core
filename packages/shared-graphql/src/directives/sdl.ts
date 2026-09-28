/**
 * The directive declarations `graphql/directives/*.graphqls` ship, as strings,
 * for a schema assembled in code rather than loaded from `SHARED_SCHEMA_PATH`
 * — an edge runtime with no file system, or a test.
 *
 * The files are the source; these are copies of their declarations, without
 * the `#` comments, and `sdl.spec.ts` holds each equal to its file once both
 * are parsed and printed. Edit the file, then this.
 */

/** `@permission` and its `PermissionDenial` enum. */
export const PERMISSION_DIRECTIVE_SDL = `"""
What a refused @permission looks like from outside.
"""
enum PermissionDenial {
	"""
	The same answer as for an id that never existed, so ids cannot be probed.
	The default.
	"""
	NOT_FOUND

	"""
	For a permission asked of an object the caller can already see: a viewer
	asked to edit already knows it exists, and "you may not change it" is
	honest.
	"""
	FORBIDDEN
}

"""
The permission a field requires: the caller must hold the permit \`name\` on the
\`type\` object whose id \`id\` points at.

Repeatable, and repeated ones are AND, evaluated in declaration order — the
404-then-403 ladder:

    updateNote(id: ID!, input: UpdateNoteInput!): Note!
      @permission(name: "view", type: "Note")
      @permission(name: "edit", type: "Note", onDeny: FORBIDDEN)

NOT for a field that answers a LIST the caller is entitled to: fold a Keto
query into the database filter before the read instead.
"""
directive @permission(
	"""
	The permit asked of Keto, e.g. "view". A plain relation works too; Keto
	answers \`false\`, not an error, for a name it does not know.
	"""
	name: String!

	"""
	The Keto namespace, e.g. "Note" — from the stack's OPL document.
	"""
	type: String!

	"""
	Where the object id is read: \`args.<path>\` or \`parent.<path>\`, dotted
	paths allowed, \`args.id\` when omitted. A value that turns out to be a LIST
	requires the permit on every element.
	"""
	id: String

	onDeny: PermissionDenial! = NOT_FOUND

	"""
	The i18n key the denial carries, e.g. "notes.errors.not-found". Defaults to
	\`errors.not-found\` / \`errors.insufficient-permissions\`, the shared keys.
	Set it when the service layer words the same refusal with a domain message,
	so the wording does not tell a caller which layer refused.
	"""
	message: String
) repeatable on FIELD_DEFINITION
`;

/**
 * Every directive `useKetoChecks` answers, for
 * `createSchema({ typeDefs: [KETO_DIRECTIVES_SDL, …] })`. Since `@check` was
 * removed in 3.0, that is `@permission` alone.
 */
export const KETO_DIRECTIVES_SDL = PERMISSION_DIRECTIVE_SDL;
