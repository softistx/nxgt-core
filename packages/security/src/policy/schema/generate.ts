import { z } from 'zod';
import { RulesSchema } from '../rules.schema';

/**
 * Regenerates `rules.schema.json` from the Zod `RulesSchema`. Run via
 * `bun run schema:gen` whenever `rules.schema.ts` changes; the output is
 * checked in so editors get YAML autocompletion without running anything.
 */
const jsonSchema = z.toJSONSchema(RulesSchema, {
	target: 'draft-7',
});

const outFile = new URL('./rules.schema.json', import.meta.url);
await Bun.write(outFile, `${JSON.stringify(jsonSchema, null, '\t')}\n`);

console.log(`Wrote ${outFile.pathname}`);
