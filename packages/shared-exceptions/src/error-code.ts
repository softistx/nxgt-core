export enum ErrorCode {
	BadRequest = 'BAD_REQUEST',
	Forbidden = 'FORBIDDEN',
	InternalServerError = 'INTERNAL_SERVER_ERROR',
	NotFound = 'NOT_FOUND',
	Unauthenticated = 'UNAUTHENTICATED',
	ValidationError = 'VALIDATION_ERROR',
	Conflict = 'CONFLICT',
	/**
	 * A dependency this API cannot answer without is not answering — the Ory
	 * stack, first of all. Deliberately distinct from Forbidden and NotFound:
	 * an outage must never read as a denial.
	 */
	ServiceUnavailable = 'SERVICE_UNAVAILABLE',
}
