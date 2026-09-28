/**
 * Federation's own directive declarations, as a subgraph imports them.
 * `@authenticated` keeps federation's shape — no argument — which
 * `useAuthenticated` reads as "any caller". `AUTHENTICATED_DIRECTIVE_SDL`, in
 * `SHARED_TYPE_DEFS`, is the one with `type:`.
 */
export const FEDERATION_DIRECTIVES = `
directive @external on FIELD_DEFINITION | OBJECT
directive @requires(fields: FieldSet!) on FIELD_DEFINITION
directive @provides(fields: FieldSet!) on FIELD_DEFINITION
directive @key(fields: FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE
directive @shareable repeatable on OBJECT | FIELD_DEFINITION
directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
directive @override(from: String!) on FIELD_DEFINITION
directive @composeDirective(name: String!) repeatable on SCHEMA
directive @interfaceObject on OBJECT
directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
`;
