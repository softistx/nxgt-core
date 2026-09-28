import { AUTHENTICATED_DIRECTIVE_SDL } from './directives/sdl';

export const SHARED_TYPE_DEFS = `
type Query {
	_empty: String
}
type Mutation {
	_empty: String
}
type Subscription {
	_empty: String
}

${AUTHENTICATED_DIRECTIVE_SDL}
directive @policy(policies: [[String!]!]!) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM

directive @shareable on OBJECT | FIELD_DEFINITION

directive @link(url: String!, import: [String!]) on SCHEMA

`;
