import { GraphQLScalarType, Kind } from 'graphql';

export const ANY_SCALAR = {
	Any: new GraphQLScalarType<any, any>({
		name: 'Any',
		description: 'Generic scalar to represent any type',
		serialize(value) {
			return value;
		},
		parseValue(value: any) {
			return value;
		},
		parseLiteral(ast, variables) {
			switch (ast.kind) {
				case Kind.STRING:
				case Kind.BOOLEAN:
					return ast.value;
				case Kind.INT:
				case Kind.FLOAT:
					return parseFloat(ast.value);
				case Kind.OBJECT:
					return Object.fromEntries(
						ast.fields.map((field) => [field.name, field.value]),
					);
				case Kind.LIST:
					return ast.values.map((n) => this?.parseLiteral?.(n, variables));
				case Kind.NULL:
					return null;
				case Kind.VARIABLE: {
					const name = ast.name.value;
					return variables ? variables[name] : undefined;
				}
			}
		},
	}),
};
