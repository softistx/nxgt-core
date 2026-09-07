import { z } from 'zod';
import { RulesSchema } from '../rules.schema';

/**
 * Regenerates `schema/rules.schema.json` from the Zod `RulesSchema`. Run via
 * `bun run schema:gen` whenever `rules.schema.ts` changes; the output is
 * checked in so editors get YAML autocompletion without running anything.
 *
 * It lives at the package root, and in `files`, so that it **ships**. Every
 * rules file in the parc opens with a `# yaml-language-server: $schema=`
 * pragma, and a consumer can only point that at a path it actually has:
 * `node_modules/@nxgt/security/schema/rules.schema.json`. When this package
 * lived inside the consuming monorepo the pragmas pointed at its source tree;
 * after the extraction to nxgt-core those paths resolved to nothing, and the
 * completion they exist for was silently gone from three production rules
 * files. A generated artefact a consumer must read is part of the package.
 */
const jsonSchema = z.toJSONSchema(RulesSchema, {
	target: 'draft-7',
});

const outFile = new URL('../../../schema/rules.schema.json', import.meta.url);
await Bun.write(outFile, `${JSON.stringify(jsonSchema, null, '\t')}\n`);

console.log(`Wrote ${outFile.pathname}`);
