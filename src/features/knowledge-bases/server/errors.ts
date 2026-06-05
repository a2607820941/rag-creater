export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function notFound(message: string) {
  return new ServiceError(message, 404);
}

export function conflict(message: string, details?: unknown) {
  return new ServiceError(message, 409, details);
}

export function badRequest(message: string, details?: unknown) {
  return new ServiceError(message, 400, details);
}
