// =============================================================================
// Provider errors - Typed error hierarchy for Twitter provider operations
// =============================================================================

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class UpstreamError extends ProviderError {
  constructor(statusCode: number, message: string, cause?: unknown) {
    super(message, statusCode, cause);
    this.name = "UpstreamError";
  }
}

export class AuthRequiredError extends ProviderError {
  constructor(
    message: string = "Authentication cookie is required for this endpoint",
  ) {
    super(message, 401);
    this.name = "AuthRequiredError";
  }
}

export class TimeoutError extends ProviderError {
  constructor(timeoutMs: number) {
    super(`Provider request timed out after ${timeoutMs}ms`, 504);
    this.name = "TimeoutError";
  }
}
