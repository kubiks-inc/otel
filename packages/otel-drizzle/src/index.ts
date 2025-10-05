import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";

const DEFAULT_TRACER_NAME = "@kubiks/otel-drizzle";
const DEFAULT_DB_SYSTEM = "postgresql";
const INSTRUMENTED_FLAG = "__kubiksOtelDrizzleInstrumented" as const;

// Semantic conventions for database attributes
export const SEMATTRS_DB_SYSTEM = "db.system";
export const SEMATTRS_DB_OPERATION = "db.operation";
export const SEMATTRS_DB_STATEMENT = "db.statement";
export const SEMATTRS_DB_NAME = "db.name";

// Semantic conventions for network attributes
export const SEMATTRS_NET_PEER_NAME = "net.peer.name";
export const SEMATTRS_NET_PEER_PORT = "net.peer.port";

type QueryCallback = (error: unknown, result: unknown) => void;

type QueryFunction = (...args: unknown[]) => unknown;

interface DrizzleClientLike {
  query: QueryFunction;
  [INSTRUMENTED_FLAG]?: true;
}

/**
 * Configuration options for Drizzle instrumentation.
 */
export interface InstrumentDrizzleConfig {
  /**
   * Custom tracer name. Defaults to "\@kubiks/otel-drizzle".
   */
  tracerName?: string;

  /**
   * Database system identifier (e.g., "postgresql", "mysql", "sqlite").
   * Defaults to "postgresql".
   */
  dbSystem?: string;

  /**
   * Database name to include in spans.
   */
  dbName?: string;

  /**
   * Whether to capture full SQL query text in spans.
   * Defaults to true.
   */
  captureQueryText?: boolean;

  /**
   * Maximum length for captured query text. Queries longer than this
   * will be truncated. Defaults to 1000 characters.
   */
  maxQueryTextLength?: number;

  /**
   * Remote hostname or IP address of the database server.
   * Example: "db.example.com" or "192.168.1.100"
   */
  peerName?: string;

  /**
   * Remote port number of the database server.
   * Example: 5432 for PostgreSQL, 3306 for MySQL
   */
  peerPort?: number;
}

/**
 * Extracts SQL query text from various query argument formats.
 */
function extractQueryText(queryArg: unknown): string | undefined {
  if (typeof queryArg === "string") {
    return queryArg;
  }
  if (queryArg && typeof queryArg === "object") {
    // PostgreSQL-style query object
    if (typeof (queryArg as { text?: unknown }).text === "string") {
      return (queryArg as { text: string }).text;
    }
    // MySQL/generic-style query object
    if (typeof (queryArg as { sql?: unknown }).sql === "string") {
      return (queryArg as { sql: string }).sql;
    }
    // Drizzle SQL object
    if (
      typeof (queryArg as { queryChunks?: unknown }).queryChunks === "object"
    ) {
      // Drizzle query objects may have complex structure, try to extract meaningful info
      const drizzleQuery = queryArg as Record<string, unknown>;
      if (typeof drizzleQuery.sql === "string") {
        return drizzleQuery.sql;
      }
    }
  }
  return undefined;
}

/**
 * Sanitizes and truncates query text for safe inclusion in spans.
 */
function sanitizeQueryText(queryText: string, maxLength: number): string {
  if (queryText.length <= maxLength) {
    return queryText;
  }
  return `${queryText.substring(0, maxLength)}...`;
}

/**
 * Extracts the SQL operation (SELECT, INSERT, etc.) from query text.
 */
function extractOperation(queryText: string): string | undefined {
  const trimmed = queryText.trimStart();
  const match = /^(?<op>\w+)/u.exec(trimmed);
  return match?.groups?.op?.toUpperCase();
}

/**
 * Finalizes a span with status, timing, and optional error.
 */
function finalizeSpan(span: Span, error?: unknown): void {
  if (error) {
    if (error instanceof Error) {
      span.recordException(error);
    } else {
      span.recordException(new Error(String(error)));
    }
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

/**
 * Instruments a database connection pool with OpenTelemetry tracing.
 *
 * This function wraps the connection pool's `query` method to automatically create
 * spans for each database operation.
 * The instrumentation is idempotent - calling it multiple times on the same
 * pool will only instrument it once.
 *
 * @typeParam TClient - The type of the database connection pool or client
 * @param client - The database connection pool or client to instrument (e.g., pg Pool, mysql2 Connection)
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented pool/client (same instance, modified in place)
 *
 * @example
 * ```typescript
 * // PostgreSQL with node-postgres
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { Pool } from 'pg';
 * import { instrumentDrizzle } from '@kubiks/otel-drizzle';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const instrumentedPool = instrumentDrizzle(pool);
 * const db = drizzle(instrumentedPool);
 *
 * // With custom configuration
 * const instrumentedPool = instrumentDrizzle(pool, {
 *   dbSystem: 'postgresql',
 *   dbName: 'myapp',
 *   captureQueryText: true,
 *   maxQueryTextLength: 1000,
 *   peerName: 'db.example.com',
 *   peerPort: 5432,
 * });
 * const db = drizzle(instrumentedPool);
 * ```
 *
 * @example
 * ```typescript
 * // MySQL with mysql2
 * import { drizzle } from 'drizzle-orm/mysql2';
 * import mysql from 'mysql2/promise';
 * import { instrumentDrizzle } from '@kubiks/otel-drizzle';
 *
 * const connection = await mysql.createConnection(process.env.DATABASE_URL);
 * const db = drizzle(instrumentDrizzle(connection, { dbSystem: 'mysql' }));
 * ```
 *
 * @example
 * ```typescript
 * // SQLite with better-sqlite3
 * import { drizzle } from 'drizzle-orm/better-sqlite3';
 * import Database from 'better-sqlite3';
 * import { instrumentDrizzle } from '@kubiks/otel-drizzle';
 *
 * const sqlite = new Database('database.db');
 * const db = drizzle(instrumentDrizzle(sqlite, { dbSystem: 'sqlite' }));
 * ```
 */
export function instrumentDrizzle<TClient extends DrizzleClientLike>(
  client: TClient,
  config?: InstrumentDrizzleConfig,
): TClient {
  if (!client) {
    return client;
  }
  if (typeof client.query !== "function") {
    return client;
  }

  if (client[INSTRUMENTED_FLAG]) {
    return client;
  }

  const {
    tracerName = DEFAULT_TRACER_NAME,
    dbSystem = DEFAULT_DB_SYSTEM,
    dbName,
    captureQueryText = true,
    maxQueryTextLength = 1000,
    peerName,
    peerPort,
  } = config ?? {};

  const tracer = trace.getTracer(tracerName);
  const originalQuery = client.query;

  const instrumentedQuery: QueryFunction = function instrumented(
    this: unknown,
    ...incomingArgs: unknown[]
  ) {
    const args = [...incomingArgs];
    let callback: QueryCallback | undefined;

    // Detect callback pattern
    if (typeof args[args.length - 1] === "function") {
      callback = args.pop() as QueryCallback;
    }

    // Extract query information
    const queryText = extractQueryText(args[0]);
    const operation = queryText ? extractOperation(queryText) : undefined;
    const spanName = operation
      ? `drizzle.${operation.toLowerCase()}`
      : "drizzle.query";

    // Start span
    const span = tracer.startSpan(spanName, { kind: SpanKind.CLIENT });
    span.setAttribute(SEMATTRS_DB_SYSTEM, dbSystem);

    if (operation) {
      span.setAttribute(SEMATTRS_DB_OPERATION, operation);
    }

    if (dbName) {
      span.setAttribute(SEMATTRS_DB_NAME, dbName);
    }

    if (captureQueryText && queryText !== undefined) {
      const sanitized = sanitizeQueryText(queryText, maxQueryTextLength);
      span.setAttribute(SEMATTRS_DB_STATEMENT, sanitized);
    }

    if (peerName) {
      span.setAttribute(SEMATTRS_NET_PEER_NAME, peerName);
    }

    if (peerPort) {
      span.setAttribute(SEMATTRS_NET_PEER_PORT, peerPort);
    }

    const activeContext = trace.setSpan(context.active(), span);

    // Callback-based pattern
    if (callback) {
      return context.with(activeContext, () => {
        const wrappedCallback: QueryCallback = (err, result) => {
          finalizeSpan(span, err);
          if (callback) {
            callback(err, result);
          }
        };

        try {
          return originalQuery.apply(this, [...args, wrappedCallback]);
        } catch (error) {
          finalizeSpan(span, error);
          throw error;
        }
      });
    }

    // Promise-based pattern
    return context.with(activeContext, () => {
      try {
        const result = originalQuery.apply(this, args);
        return Promise.resolve(result)
          .then((value) => {
            finalizeSpan(span);
            return value;
          })
          .catch((error) => {
            finalizeSpan(span, error);
            throw error;
          });
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    });
  };

  client[INSTRUMENTED_FLAG] = true;
  client.query = instrumentedQuery;

  return client;
}
