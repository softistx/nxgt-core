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

directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM

directive @policy(policies: [[String!]!]!) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM

directive @shareable on OBJECT | FIELD_DEFINITION

directive @link(url: String!, import: [String!]) on SCHEMA

`;
