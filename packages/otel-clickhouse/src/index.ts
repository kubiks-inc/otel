import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import type {
  ClickHouseClient,
  DataFormat,
  QueryParams,
} from "@clickhouse/client";

const DEFAULT_TRACER_NAME = "@kubiks/otel-clickhouse";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelClickHouseInstrumented");

// Semantic conventions for database attributes
export const SEMATTRS_DB_SYSTEM = "db.system" as const;
export const SEMATTRS_DB_OPERATION = "db.operation" as const;
export const SEMATTRS_DB_STATEMENT = "db.statement" as const;
export const SEMATTRS_DB_NAME = "db.name" as const;
export const SEMATTRS_NET_PEER_NAME = "net.peer.name" as const;
export const SEMATTRS_NET_PEER_PORT = "net.peer.port" as const;

// ClickHouse-specific attributes
export const SEMATTRS_CLICKHOUSE_READ_ROWS = "clickhouse.read_rows" as const;
export const SEMATTRS_CLICKHOUSE_READ_BYTES = "clickhouse.read_bytes" as const;
export const SEMATTRS_CLICKHOUSE_WRITTEN_ROWS =
  "clickhouse.written_rows" as const;
export const SEMATTRS_CLICKHOUSE_WRITTEN_BYTES =
  "clickhouse.written_bytes" as const;
export const SEMATTRS_CLICKHOUSE_TOTAL_ROWS_TO_READ =
  "clickhouse.total_rows_to_read" as const;
export const SEMATTRS_CLICKHOUSE_RESULT_ROWS =
  "clickhouse.result_rows" as const;
export const SEMATTRS_CLICKHOUSE_RESULT_BYTES =
  "clickhouse.result_bytes" as const;
export const SEMATTRS_CLICKHOUSE_ELAPSED_NS = "clickhouse.elapsed_ns" as const;
export const SEMATTRS_CLICKHOUSE_REAL_TIME_MICROSECONDS =
  "clickhouse.real_time_microseconds" as const;

/**
 * ClickHouse query summary from response headers
 */
export interface ClickHouseSummary {
  read_rows: string;
  read_bytes: string;
  written_rows: string;
  written_bytes: string;
  total_rows_to_read: string;
  result_rows: string;
  result_bytes: string;
  elapsed_ns: string;
  /** Available only after ClickHouse 24.9 */
  real_time_microseconds?: string;
}

/**
 * Configuration options for ClickHouse instrumentation.
 */
export interface InstrumentClickHouseConfig {
  /**
   * Custom tracer name. Defaults to "@kubiks/otel-clickhouse".
   */
  tracerName?: string;

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
   * Remote hostname or IP address of the ClickHouse server.
   * Example: "clickhouse.example.com" or "192.168.1.100"
   */
  peerName?: string;

  /**
   * Remote port number of the ClickHouse server.
   * Example: 8123 for HTTP, 9000 for native protocol
   */
  peerPort?: number;

  /**
   * Whether to capture ClickHouse execution statistics from response headers.
   * This includes read/written rows, bytes, elapsed time, etc.
   * Defaults to true.
   */
  captureExecutionStats?: boolean;
}

interface InstrumentedClient extends ClickHouseClient {
  [INSTRUMENTED_FLAG]?: true;
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
 * Extracts ClickHouse summary from response headers.
 */
function extractSummary(headers: any): ClickHouseSummary | undefined {
  if (!headers) {
    return undefined;
  }

  // The ClickHouse client provides summary in the response headers
  const summary = headers["x-clickhouse-summary"];
  if (summary && typeof summary === "string") {
    try {
      return JSON.parse(summary) as ClickHouseSummary;
    } catch {
      return undefined;
    }
  }

  // Fallback: check if headers already contain the summary fields
  if (
    "read_rows" in headers ||
    "result_rows" in headers ||
    "elapsed_ns" in headers
  ) {
    return headers as ClickHouseSummary;
  }

  return undefined;
}

/**
 * Adds ClickHouse execution statistics to span attributes.
 */
function addExecutionStats(span: Span, summary: ClickHouseSummary): void {
  try {
    // Add all available statistics as attributes
    if (summary.read_rows !== undefined) {
      const readRows = parseInt(summary.read_rows, 10);
      if (!isNaN(readRows)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_READ_ROWS, readRows);
      }
    }

    if (summary.read_bytes !== undefined) {
      const readBytes = parseInt(summary.read_bytes, 10);
      if (!isNaN(readBytes)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_READ_BYTES, readBytes);
      }
    }

    if (summary.written_rows !== undefined) {
      const writtenRows = parseInt(summary.written_rows, 10);
      if (!isNaN(writtenRows)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_WRITTEN_ROWS, writtenRows);
      }
    }

    if (summary.written_bytes !== undefined) {
      const writtenBytes = parseInt(summary.written_bytes, 10);
      if (!isNaN(writtenBytes)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_WRITTEN_BYTES, writtenBytes);
      }
    }

    if (summary.total_rows_to_read !== undefined) {
      const totalRowsToRead = parseInt(summary.total_rows_to_read, 10);
      if (!isNaN(totalRowsToRead)) {
        span.setAttribute(
          SEMATTRS_CLICKHOUSE_TOTAL_ROWS_TO_READ,
          totalRowsToRead
        );
      }
    }

    if (summary.result_rows !== undefined) {
      const resultRows = parseInt(summary.result_rows, 10);
      if (!isNaN(resultRows)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_RESULT_ROWS, resultRows);
      }
    }

    if (summary.result_bytes !== undefined) {
      const resultBytes = parseInt(summary.result_bytes, 10);
      if (!isNaN(resultBytes)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_RESULT_BYTES, resultBytes);
      }
    }

    if (summary.elapsed_ns !== undefined) {
      const elapsedNs = parseInt(summary.elapsed_ns, 10);
      if (!isNaN(elapsedNs)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_ELAPSED_NS, elapsedNs);
      }
    }

    // Available only after ClickHouse 24.9
    if (summary.real_time_microseconds !== undefined) {
      const realTimeMicroseconds = parseInt(
        summary.real_time_microseconds,
        10
      );
      if (!isNaN(realTimeMicroseconds)) {
        span.setAttribute(
          SEMATTRS_CLICKHOUSE_REAL_TIME_MICROSECONDS,
          realTimeMicroseconds
        );
      }
    }
  } catch (error) {
    // Silently ignore errors in stats extraction
    // to avoid disrupting the application
  }
}

/**
 * Instruments a ClickHouse client with OpenTelemetry tracing.
 *
 * This function wraps the client's `query` method to create spans for each database
 * operation, including detailed execution statistics from ClickHouse response headers.
 *
 * The instrumentation is idempotent - calling it multiple times on the same client will only
 * instrument it once.
 *
 * @typeParam TClient - The type of the ClickHouse client
 * @param client - The ClickHouse client to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented client (same instance, modified in place)
 *
 * @example
 * ```typescript
 * import { createClient } from '@clickhouse/client';
 * import { instrumentClickHouse } from '@kubiks/otel-clickhouse';
 *
 * const client = createClient({
 *   host: 'http://localhost:8123',
 *   username: 'default',
 *   password: '',
 * });
 *
 * instrumentClickHouse(client, {
 *   dbName: 'default',
 *   captureQueryText: true,
 *   captureExecutionStats: true,
 *   peerName: 'localhost',
 *   peerPort: 8123,
 * });
 *
 * // All queries are now traced with detailed metrics
 * const result = await client.query({
 *   query: 'SELECT * FROM users WHERE id = {id:UInt32}',
 *   query_params: { id: 1 },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With ClickHouse Cloud
 * import { createClient } from '@clickhouse/client';
 * import { instrumentClickHouse } from '@kubiks/otel-clickhouse';
 *
 * const client = createClient({
 *   host: 'https://your-instance.clickhouse.cloud:8443',
 *   username: 'default',
 *   password: 'your-password',
 * });
 *
 * instrumentClickHouse(client, {
 *   dbName: 'default',
 *   peerName: 'your-instance.clickhouse.cloud',
 *   peerPort: 8443,
 * });
 * ```
 */
export function instrumentClickHouse(
  client: ClickHouseClient,
  config?: InstrumentClickHouseConfig
): ClickHouseClient {
  if (!client) {
    return client;
  }

  // Check if already instrumented
  const instrumentedClient = client as InstrumentedClient;
  if (instrumentedClient[INSTRUMENTED_FLAG]) {
    return client;
  }

  const {
    tracerName = DEFAULT_TRACER_NAME,
    dbName,
    captureQueryText = true,
    maxQueryTextLength = 1000,
    peerName,
    peerPort,
    captureExecutionStats = true,
  } = config ?? {};

  const tracer = trace.getTracer(tracerName);

  // Store the original query method
  const originalQuery = client.query.bind(client);

  // Create instrumented query method
  client.query = async function instrumentedQuery(
    params: QueryParams
  ): Promise<any> {
    // Extract query text from params
    const queryText = params.query;

    const operation = queryText ? extractOperation(queryText) : undefined;
    const spanName = operation
      ? `clickhouse.${operation.toLowerCase()}`
      : "clickhouse.query";

    // Start span
    const span = tracer.startSpan(spanName, { kind: SpanKind.CLIENT });
    span.setAttribute(SEMATTRS_DB_SYSTEM, "clickhouse");

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

    try {
      const result = await context.with(activeContext, () =>
        originalQuery(params)
      );

      // Extract and add execution statistics from response headers
      if (captureExecutionStats) {
        const summary = extractSummary(result.response_headers);
        if (summary) {
          addExecutionStats(span, summary);
        }
      }

      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Mark as instrumented
  instrumentedClient[INSTRUMENTED_FLAG] = true;

  return client;
}
