// =============================================================================
// Common Zod Schemas - shared error responses and pagination
// =============================================================================

import { z } from "@hono/zod-openapi";

export const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.string(),
    details: z.unknown().optional(),
  })
  .openapi("ErrorResponse");

export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });
