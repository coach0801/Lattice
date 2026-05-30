/**
 * Base error class for all Lattice Protocol SDK errors.
 */
export class LatticeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LatticeError'
    // Restore prototype chain (required when extending built-in Error in TypeScript)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Thrown when the Lattice API returns a non-2xx HTTP response.
 */
export class LatticeApiError extends LatticeError {
  readonly statusCode: number
  readonly responseBody: unknown

  constructor(statusCode: number, message: string, responseBody?: unknown) {
    super(message)
    this.name = 'LatticeApiError'
    this.statusCode = statusCode
    this.responseBody = responseBody
  }

  get isNotFound(): boolean {
    return this.statusCode === 404
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401
  }

  get isForbidden(): boolean {
    return this.statusCode === 403
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429
  }

  get isServerError(): boolean {
    return this.statusCode >= 500
  }
}

/**
 * Thrown when a network/fetch-level error occurs (e.g. DNS failure, timeout,
 * connection refused) — not an HTTP error code.
 */
export class LatticeNetworkError extends LatticeError {
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'LatticeNetworkError'
    this.cause = cause
  }
}

/**
 * Thrown when input to an SDK method fails validation before a request is made.
 */
export class LatticeValidationError extends LatticeError {
  readonly field?: string

  constructor(message: string, field?: string) {
    super(message)
    this.name = 'LatticeValidationError'
    this.field = field
  }
}
