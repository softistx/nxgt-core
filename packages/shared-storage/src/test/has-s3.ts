/**
 * These suites talk to a real S3 — MinIO in the estate — and there is no
 * usable fake: the point of them is the wire behaviour of `Bun.s3`.
 *
 * So they run where an S3 is configured and are skipped where it is not,
 * rather than failing a build for an absence. A missing variable is the honest
 * signal: `StorageService` reads all four at module load, and with `S3_ENDPOINT`
 * unset it silently addresses AWS instead of the local MinIO.
 */
export const hasS3 = [
	'S3_ENDPOINT',
	'S3_BUCKET',
	'S3_USER',
	'S3_PASSWORD',
].every((name) => Boolean(Bun.env[name]));
