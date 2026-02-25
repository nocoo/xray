// =============================================================================
// App Factory - Creates the Hono app with injected dependencies
// Exported separately from index.ts for testability.
// =============================================================================

import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { logger } from "hono/logger";
import type { ITwitterProvider } from "./providers/types";
import { createTwitterRoutes } from "./routes/twitter";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";

export interface AppDeps {
  twitterProvider: ITwitterProvider;
}

type AppEnv = {
  Variables: {
    provider: ITwitterProvider;
  };
};

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<AppEnv>();

  // ---------------------------------------------------------------------------
  // Global middleware
  // ---------------------------------------------------------------------------
  app.use(logger());

  // ---------------------------------------------------------------------------
  // Inject provider into context for all /twitter routes
  // ---------------------------------------------------------------------------
  app.use("/twitter/*", async (c, next) => {
    c.set("provider", deps.twitterProvider);
    await next();
  });

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------
  // Twitter routes
  // ---------------------------------------------------------------------------
  const twitterRoutes = createTwitterRoutes();
  app.route("/twitter", twitterRoutes);

  // ---------------------------------------------------------------------------
  // OpenAPI spec & Swagger UI
  // ---------------------------------------------------------------------------
  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      title: "X-Ray API",
      version: "0.2.2",
      description: "Social media data proxy with provider abstraction",
    },
  });

  app.get("/ui", swaggerUI({ url: "/doc" }));

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  return app;
}
