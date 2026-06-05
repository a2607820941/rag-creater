import { ZodError } from "zod";

import { ServiceError } from "@/features/knowledge-bases/server/errors";

export function successResponse<T>(data: T, init?: ResponseInit) {
  return Response.json(
    {
      success: true,
      data,
    },
    init
  );
}

export function errorResponse(
  message: string,
  status = 500,
  details?: unknown
) {
  return Response.json(
    {
      success: false,
      message,
      ...(details === undefined ? {} : { details }),
    },
    { status }
  );
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return errorResponse("Invalid request parameters", 400, error.flatten());
  }

  if (error instanceof ServiceError) {
    return errorResponse(error.message, error.status, error.details);
  }

  console.error(error);
  return errorResponse("Internal server error", 500);
}
