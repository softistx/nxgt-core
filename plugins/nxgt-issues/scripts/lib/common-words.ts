/**
 * Words too common to deny alone when they are the stem of a private
 * repository (`compose` from `acme-compose`): English words a bug report uses
 * in passing, and the names of frameworks, libraries, tools, HTTP and database
 * vocabulary that show up in stack traces and version lists. The repository's
 * full name is still denied; a product whose stem is one of these words is
 * named explicitly through `denyTerms`. The same list decides whether a
 * single-word repository name (`plugins`) is denied bare; `owner/name` always is.
 */

const ENGLISH = `
able about above access account action active actual added adding address after again agent alert align alpha also alter always amount angle answer apply area arrow asset atlas audio author auto avatar away
back badge balance bank banner base basic batch beacon before begin being below best beta better between bill billing black blank block blog blue board body bold book books boost border both bottom bound box brain branch brand break bridge bright bring broken browse bucket budget buffer build builder bundle business button buyer
cache calendar call camera campus canvas capital card care career carry case cash catalog cause center chain change channel chapter chart chat check child choice circle city claim class classic clean clear click client clock close cloud club code coin cold collect color column come comment common company compare compass compose concept config connect console contact content context control copy core corner count counter country course cover craft create credit cross crowd current cursor custom cycle
daily dash dashboard data date dawn deal debug decide deep default delete delta demo desk desktop detail device dial diary digit direct dispatch display docs document domain done door double down draft drag draw dream drive drop dump during
each early earth easy echo edge edit editor effect empty enable end engine enter entry envelope error event every exact example exchange exit expert export express extra
face fact fair fall false family fast feature feed field file fill filter final find fine fire first five fix flag flash fleet flex flow focus folder follow font food form format forum forward frame free fresh friend front full fund future
gallery game garden gate gather general gift give glass global goal gold good graph green grid group grow guard guest guide
half hand handle happy hard head header health heart help hero high history hold home hook host hour house hover hub human
icon idea image import inbox index info inner input insight inside install issue item
join journal jump just
keep kind kit know
label lake land large last later launch layer layout lead learn left legal lens less letter level library life light like limit line link list little live load local lock logic long look loop lower
machine magic mail main major make manage manager many map mark market master match matter media member memo memory menu merge message meta metric middle mind mini minute mirror mobile mode model module moment money monitor month more motion mount move much music
name native near need nest network news next night node none north note notes notice number
object ocean offer office offline often okay once online only open option orange order origin other outer output over owner
pack package page paint pair panel paper parent park part party pass past patch path pause peak people period person phone photo pick piece pilot pipe pixel place plain plan planet plant platform play player plaza plus pocket point policy pool popup port portal post power press preview price primary print private probe product profile program project prompt proof proxy public pulse pure push
query queue quick quiet quote
radar radio rail range rank rapid rate reach read ready real record redirect refresh region relay release remote render repair repeat reply report request reset resolve resource rest result return review rich ride right ring rise river road robot rock role room root round route router rule rush
safe sale sample save scale scan scene school scope score screen script scroll search season second secure seed select self sell send sense series serve server service session setup shape share sheet shell shift shop short show side sign signal silver simple single site size skill slide slot small smart snap social soft solid sound source south space spark speak speed spot spring stack staff stage standard star start state static status step stock stone stop storage store story stream street strong studio study style submit suite summary super supply support surf switch sync system
table tabs tail take talent talk task team tech temp term test text theme thing think thread tick ticket tide time tiny title today toggle tool tools touch tower town track trade trail train transfer travel tree trend trial trip true trust turn type
under unit update upload upper urban usage user valid value vault vector venue verify version video view village vision visit voice
wait walk wall watch water wave week welcome well west wheel white wide widget window wire wise word work worker world write yard year yellow young zero zone
`;

const TECH = `
android angular apollo astro axios babel bootstrap browser bunx chrome chromium cypress deno django docker drizzle electron elastic ember esbuild eslint expo express fastify firebase flutter gatsby github gitlab gradle graphql grpc helm hono http https ionic jest jquery kafka kotlin kubernetes laravel lerna linux lodash mariadb material mocha mongo mongodb mongoose mysql nats nestjs netlify nextjs nginx nodejs nuxt oauth openapi openid playwright pnpm postcss postgres postgresql prisma puppeteer python rails react redis redux remix rollup ruby rust sass sentry sequelize socket solid spring sqlite stripe supabase svelte swagger swift tailwind terraform turbo typeorm typescript ubuntu vercel vite vitest vitejs vuejs vuex webpack windows yarn zod
json yaml toml html markdown utf8 base64 bearer cookie cors csrf jwt saml smtp imap webhook websocket stream request response headers status method content charset accept agent payload params cookies
database table tables schema schemas index indexes migration migrations collection documents cluster replica shard query queries cursor transaction model models seed seeds
middleware handler handlers controller controllers resolver resolvers provider providers adapter adapters plugin plugins loader loaders client clients factory helper helpers hooks store stores context reducer service services gateway proxy router routes worker workers queue queues cron scheduler logger logging tracer metrics
`;

const MORE = `
apis oauth2 workspace workspaces python kotlin swift java elysia latex cssnano csso clean-css maizzle mjml melos
learn learning model models training location locations plugin plugins
`;

export const COMMON_WORDS: ReadonlySet<string> = new Set(
	`${ENGLISH} ${TECH} ${MORE} tex`
		.split(/\s+/)
		.filter((word) => word.length >= 3),
);

/**
 * Whether `word` is a common word, or a plural, `-ing` form or versioned form
 * of one (`locations`, `oauth2`, `http2`), or in `extra` (the generic words).
 */
export function isCommonWord(
	word: string,
	extra: ReadonlySet<string> = new Set(),
): boolean {
	const lower = word.toLowerCase();
	const bare = lower.replace(/\d+$/, '');
	const forms = [lower, bare];
	for (const base of [lower, bare]) {
		for (const suffix of ['ing', 'es', 's']) {
			if (base.endsWith(suffix)) forms.push(base.slice(0, -suffix.length));
		}
	}
	return forms.some((form) => COMMON_WORDS.has(form) || extra.has(form));
}
