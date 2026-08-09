import { Auth } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { appendFileSync } from "fs";
import { authConfig } from "@/auth";
import {
  toNextRequest,
  withCanonicalAuthOrigin,
} from "@/lib/auth-request";

const DEBUG = "/tmp/auth-debug.log";
function log(msg: string) {
  try {
    appendFileSync(DEBUG, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // ignore
  }
}

function prepareConfig(config: NextAuthConfig): NextAuthConfig {
  const prepared: NextAuthConfig = {
    ...config,
    providers: [...config.providers],
  };
  prepared.secret ??=
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? undefined;
  prepared.basePath ??= "/api/auth";
  prepared.trustHost = true;
  return prepared;
}

async function handler(req: Request): Promise<Response> {
  log(`enter ${req.method} ${req.url}`);
  try {
    log("toNextRequest…");
    const base = await toNextRequest(req);
    log(`toNextRequest ok method=${base.method} bodyUsed`);
    log("withCanonical…");
    const nextReq = await withCanonicalAuthOrigin(base);
    log(`canonical ok ${nextReq.nextUrl.href}`);
    log("Auth…");
    const res = await Auth(nextReq, prepareConfig(authConfig));
    log(`Auth done status=${res.status}`);
    return res;
  } catch (e) {
    log(`ERR ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    throw e;
  }
}

export const GET = handler;
export const POST = handler;
