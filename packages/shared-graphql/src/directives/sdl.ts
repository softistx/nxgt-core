/**
 * The directive declarations `graphql/directives/*.graphqls` ship, as strings,
 * for a schema assembled in code rather than loaded from `SHARED_SCHEMA_PATH`
 * — an edge runtime with no file system, or a test.
 *
 * The files are the source; these are copies of their declarations, without
 * the `#` comments, and `sdl.spec.ts` holds each equal to its file once both
 * are parsed and printed. Edit the file, then this.
 */

/** `@check`, its `CheckPermission` input and its `CheckDenial` enum. */
export const CHECK_DIRECTIVE_SDL = `"""
One question, with the object left as a path instead of a value.
"""
input CheckPermission {
	"""
	The Keto namespace, e.g. "Note" — from the stack's OPL document.
	"""
	namespace: String!

	"""
	The permit asked of it, e.g. "view". A plain relation works too; Keto
	answers \`false\`, not an error, for a name it does not know.
	"""
	permit: String!

	"""
	Where the object id is read: \`args.<path>\`, or \`parent.<path>\` /
	\`source.<path>\` (the same root under two names), dotted paths allowed. A value that turns out to be a LIST requires the permit on every
	element — that is what a mutation taking \`ids: [ID!]!\` means.
	"""
	id: String = "args.id"
}

"""
What a denial looks like from outside.
"""
enum CheckDenial {
	"""
	The same answer as for an id that never existed, so ids cannot be probed.
	The default, and the one to keep unless the caller already knows the object
	is there.
	"""
	NOT_FOUND

	"""
	For a second check on an object the caller can already see: a viewer asked
	to edit already knows it exists, and "you may not change it" is honest.
	"""
	FORBIDDEN
}

"""
Deprecated: write \`@permission(name:, type:)\` in a new schema — one Keto
question per directive, repeated for AND, with OR kept in the Keto model. This
form keeps working and is evaluated in declaration order with @permission.

The permission a field requires, in disjunctive normal form: the OUTER list is
OR, the INNER list is AND. \`[[A, B], [C]]\` reads "(A and B) or C" — the same
shape \`@policy(policies: [["ADMIN"]])\` uses.

Repeatable, and evaluated in declaration order, each with its own \`onDeny\`.
That is how the 404-then-403 ladder is written:

    updateNote(id: ID!, input: UpdateNoteInput!): Note!
      @check(permissions: [[{ namespace: "Note", permit: "view" }]])
      @check(permissions: [[{ namespace: "Note", permit: "edit" }]], onDeny: FORBIDDEN)

NOT for a field that answers a LIST the caller is entitled to. "Which notes may
I see" is not a check, it is a Keto query folded into the database filter
before the read. A directive there would have to fetch everything and filter
after, which makes \`totalCount\` and the cursors lie.
"""
directive @check(
	permissions: [[CheckPermission!]!]!
	onDeny: CheckDenial! = NOT_FOUND

	"""
	The i18n key the denial carries, e.g. "notes.errors.not-found". Defaults to
	\`errors.not-found\` / \`errors.insufficient-permissions\`, the shared keys.

	Set it whenever the API's own service layer answers the same refusal with a
	domain message. Two layers guard these fields — the directive, and the
	\`require<M>Access\` the service calls — and if they word the same 404
	differently, the wording tells a caller WHICH one refused: a generic message
	means "you may not", a domain one means "it is gone". That is precisely the
	distinction NOT_FOUND exists to hide.
	"""
	message: String
) repeatable on FIELD_DEFINITION
`;

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

/** Both, for `createSchema({ typeDefs: [KETO_DIRECTIVES_SDL, …] })`. */
export const KETO_DIRECTIVES_SDL = `${CHECK_DIRECTIVE_SDL}\n${PERMISSION_DIRECTIVE_SDL}`;
