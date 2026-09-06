declare module 'bun' {
	interface Env {
		/** S3 */
		S3_ENDPOINT: string;
		S3_USER: string;
		S3_PASSWORD: string;
		S3_BUCKET: string;
	}
}
