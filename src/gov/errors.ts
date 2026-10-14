/** An expected error from the mock government backend, with an HTTP status code. */
export class GovError extends Error {
	constructor(
		public status: 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503,
		message: string,
	) {
		super(message);
		this.name = "GovError";
	}
}

/** Simulated outage (see MOCK_FAILURE_RATE / ?simulate=error). */
export class MockOutageError extends GovError {
	constructor() {
		super(503, "The government service is temporarily unavailable (simulated outage).");
		this.name = "MockOutageError";
	}
}
