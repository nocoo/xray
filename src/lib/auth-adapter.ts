/**
 * Custom Auth.js Adapter for local SQLite (bun:sqlite / better-sqlite3).
 *
 * Uses the raw SQLite driver via getRawSqlite() — synchronous queries
 * wrapped in async Adapter methods. Keeps the same table schema as
 * initSchema() in src/db/index.ts:
 *
 *   - user:              id TEXT PK, name, email UNIQUE, emailVerified, image
 *   - account:           (provider, providerAccountId) composite PK, userId FK
 *   - session:           sessionToken TEXT PK, userId FK, expires
 *   - verificationToken: (identifier, token) composite PK, expires
 *
 * With this adapter active, NextAuth resolves returning users via
 * getUserByAccount() — the same Google account always maps to the
 * same user.id regardless of browser or session.
 */

import type { Adapter } from "@auth/core/adapters";
import { getRawSqlite, getDb } from "@/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function rowToUser(row: Row) {
  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    email: row.email as string,
    emailVerified: row.emailVerified
      ? new Date(row.emailVerified as number)
      : null,
    image: (row.image as string) ?? null,
  };
}

export function SqliteAdapter(): Adapter {
  // Lazy ref — getRawSqlite() may not be ready at import time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql = () => { getDb(); return getRawSqlite() as any; };

  return {
    async createUser(user) {
      // Handle legacy users: if a user row already exists for this email
      // (created by the old ensureUserExists() flow before the adapter was added),
      // return the existing user instead of inserting a duplicate.
      // This prevents SQLITE_CONSTRAINT on the email UNIQUE index.
      const existing = sql()
        .prepare("SELECT * FROM user WHERE email = ?")
        .get(user.email) as Row | null;

      if (existing) {
        // Update profile fields that may have changed (name, image)
        sql()
          .prepare("UPDATE user SET name = ?, image = ? WHERE id = ?")
          .run(user.name ?? existing.name, user.image ?? existing.image, existing.id);
        return rowToUser(
          sql().prepare("SELECT * FROM user WHERE id = ?").get(existing.id) as Row
        );
      }

      const id = crypto.randomUUID();
      sql()
        .prepare(
          `INSERT INTO user (id, name, email, emailVerified, image)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          id,
          user.name ?? null,
          user.email,
          user.emailVerified?.getTime() ?? null,
          user.image ?? null
        );

      return {
        id,
        name: user.name ?? null,
        email: user.email ?? "",
        emailVerified: user.emailVerified ?? null,
        image: user.image ?? null,
      };
    },

    async getUser(id) {
      const row = sql()
        .prepare("SELECT * FROM user WHERE id = ?")
        .get(id) as Row | null;
      return row ? rowToUser(row) : null;
    },

    async getUserByEmail(email) {
      const row = sql()
        .prepare("SELECT * FROM user WHERE email = ?")
        .get(email) as Row | null;
      if (!row) return null;

      // Legacy migration: if this user has no linked account rows yet
      // (created before the adapter existed), return null so NextAuth
      // treats them as a new user → createUser() reuses the row → linkAccount()
      // populates the account table. Without this, NextAuth throws
      // OAuthAccountNotLinked because it finds a user but no matching account.
      const hasAccount = sql()
        .prepare("SELECT 1 FROM account WHERE userId = ? LIMIT 1")
        .get(row.id);
      if (!hasAccount) return null;

      return rowToUser(row);
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const row = sql()
        .prepare(
          `SELECT u.* FROM user u
           JOIN account a ON u.id = a.userId
           WHERE a.provider = ? AND a.providerAccountId = ?`
        )
        .get(provider, providerAccountId) as Row | null;
      return row ? rowToUser(row) : null;
    },

    async updateUser(user) {
      const setClauses: string[] = [];
      const params: unknown[] = [];

      if (user.name !== undefined) {
        setClauses.push("name = ?");
        params.push(user.name);
      }
      if (user.email !== undefined) {
        setClauses.push("email = ?");
        params.push(user.email);
      }
      if (user.emailVerified !== undefined) {
        setClauses.push("emailVerified = ?");
        params.push(user.emailVerified?.getTime() ?? null);
      }
      if (user.image !== undefined) {
        setClauses.push("image = ?");
        params.push(user.image);
      }

      if (setClauses.length === 0) {
        // Nothing to update — return the existing user
        if (user.id) {
          const existing = await this.getUser?.(user.id);
          if (existing) return existing;
        }
        return { id: user.id ?? "", name: null, email: "", emailVerified: null, image: null };
      }

      params.push(user.id);
      sql()
        .prepare(`UPDATE user SET ${setClauses.join(", ")} WHERE id = ?`)
        .run(...params);

      const updated = sql()
        .prepare("SELECT * FROM user WHERE id = ?")
        .get(user.id) as Row;
      return rowToUser(updated);
    },

    async deleteUser(userId) {
      // CASCADE deletes handle account, session, and business tables
      sql().prepare("DELETE FROM user WHERE id = ?").run(userId);
    },

    async linkAccount(account) {
      sql()
        .prepare(
          `INSERT INTO account (userId, type, provider, providerAccountId,
             refresh_token, access_token, expires_at, token_type, scope,
             id_token, session_state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          account.refresh_token ?? null,
          account.access_token ?? null,
          account.expires_at ?? null,
          account.token_type ?? null,
          account.scope ?? null,
          account.id_token ?? null,
          account.session_state ?? null
        );

      return account;
    },

    async unlinkAccount({ providerAccountId, provider }) {
      sql()
        .prepare(
          "DELETE FROM account WHERE provider = ? AND providerAccountId = ?"
        )
        .run(provider, providerAccountId);
    },

    // Session methods — included for completeness but we use JWT strategy,
    // so these are rarely called.

    async createSession(session) {
      sql()
        .prepare(
          `INSERT INTO session (sessionToken, userId, expires)
           VALUES (?, ?, ?)`
        )
        .run(
          session.sessionToken,
          session.userId,
          session.expires.getTime()
        );
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const row = sql()
        .prepare(
          `SELECT s.sessionToken, s.userId, s.expires,
                  u.id AS u_id, u.name AS u_name, u.email AS u_email,
                  u.emailVerified AS u_emailVerified, u.image AS u_image
           FROM session s
           JOIN user u ON s.userId = u.id
           WHERE s.sessionToken = ?`
        )
        .get(sessionToken) as Row | null;

      if (!row) return null;

      return {
        session: {
          sessionToken: row.sessionToken as string,
          userId: row.userId as string,
          expires: new Date(row.expires as number),
        },
        user: {
          id: row.u_id as string,
          name: (row.u_name as string) ?? null,
          email: row.u_email as string,
          emailVerified: row.u_emailVerified
            ? new Date(row.u_emailVerified as number)
            : null,
          image: (row.u_image as string) ?? null,
        },
      };
    },

    async updateSession(session) {
      const setClauses: string[] = [];
      const params: unknown[] = [];

      if (session.expires) {
        setClauses.push("expires = ?");
        params.push(session.expires.getTime());
      }
      if (session.userId) {
        setClauses.push("userId = ?");
        params.push(session.userId);
      }

      if (setClauses.length === 0) return null;

      params.push(session.sessionToken);
      sql()
        .prepare(
          `UPDATE session SET ${setClauses.join(", ")} WHERE sessionToken = ?`
        )
        .run(...params);

      const row = sql()
        .prepare("SELECT * FROM session WHERE sessionToken = ?")
        .get(session.sessionToken) as Row | null;

      if (!row) return null;

      return {
        sessionToken: row.sessionToken as string,
        userId: row.userId as string,
        expires: new Date(row.expires as number),
      };
    },

    async deleteSession(sessionToken) {
      sql()
        .prepare("DELETE FROM session WHERE sessionToken = ?")
        .run(sessionToken);
    },

    async createVerificationToken(token) {
      sql()
        .prepare(
          `INSERT INTO verificationToken (identifier, token, expires)
           VALUES (?, ?, ?)`
        )
        .run(token.identifier, token.token, token.expires.getTime());
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const row = sql()
        .prepare(
          "SELECT * FROM verificationToken WHERE identifier = ? AND token = ?"
        )
        .get(identifier, token) as Row | null;

      if (!row) return null;

      sql()
        .prepare(
          "DELETE FROM verificationToken WHERE identifier = ? AND token = ?"
        )
        .run(identifier, token);

      return {
        identifier: row.identifier as string,
        token: row.token as string,
        expires: new Date(row.expires as number),
      };
    },
  };
}
