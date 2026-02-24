// =============================================================================
// Error Handler Middleware
// =============================================================================

import type { Context } from "hono";
import { ProviderError } from "../providers/types";

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ProviderError) {
    return c.json(
      {
        success: false,
        error: err.message,
      },
      err.statusCode as 400,
    );
  }

  // Zod validation errors from @hono/zod-openapi
  if ("issues" in err || (err as { type?: string }).type === "ZodError") {
    return c.json(
      {
        success: false,
        error: "Validation error",
        details: err,
      },
      400,
    );
  }

  console.error("Unhandled error:", err);
  return c.json(
    {
      success: false,
      error: "Internal server error",
    },
    500,
  );
}

export function notFoundHandler(c: Context) {
  return c.json(
    {
      success: false,
      error: `Not found: ${c.req.method} ${c.req.path}`,
    },
    404,
  );
}
