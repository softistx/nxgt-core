/** How a variable's value is produced when a `.env` is written from a template. */
export type Source =
	/** Generated here: a value only this deployment defines. */
	| { kind: 'generate'; generator: Generator; length: number; charset: Charset }
	/** Issued by something else — a provider, a registry, an OAuth server. */
	| { kind: 'manual'; reason: string }
	/** The template's own value is the value. */
	| { kind: 'copy' };

export type Generator = 'secret' | 'password' | 'hex' | 'base64' | 'uuid';

export type Charset = 'safe' | 'alnum' | 'hex';

/** One `KEY=value` line of a template, with everything read around it. */
export interface Entry {
	key: string;
	/** The template's value, verbatim, quotes included. */
	value: string;
	/** The comment lines immediately above, in order, `#` stripped. */
	comments: string[];
	/** 1-based line number in the template. */
	line: number;
	/** Where the value comes from, and why. */
	source: Source;
	/** Set when an `# @env …` annotation decided it, rather than the name. */
	annotated: boolean;
}

export interface Template {
	entries: Entry[];
	/** Every line of the template, so the output can mirror its shape. */
	lines: string[];
}

export interface RenderResult {
	text: string;
	generated: string[];
	kept: string[];
	/** Declared `manual` and still empty — someone has to paste these. */
	pending: string[];
}

export interface CheckResult {
	/** In the template, absent from the `.env`. */
	missing: string[];
	/** In the `.env`, absent from the template — usually a rename nobody finished. */
	extra: string[];
	/** Present and empty, and not declared `manual`. */
	empty: string[];
	/** Declared `manual` and empty: expected to be pasted, not a failure. */
	pending: string[];
	ok: boolean;
}
