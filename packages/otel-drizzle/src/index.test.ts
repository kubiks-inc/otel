import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { instrumentDrizzle, type InstrumentDrizzleConfig } from "./index";

interface MockDrizzleClient {
  query: (...args: any[]) => unknown;
}

describe("instrumentDrizzle", () => {
  let provider: BasicTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
    trace.disable();
  });

  it("wraps the query method only once", () => {
    const client: MockDrizzleClient = {
      query: vi.fn(),
    };

    const instrumented = instrumentDrizzle(client);

    expect(instrumented.query).not.toBeUndefined();
    const wrappedQuery = instrumented.query;

    instrumentDrizzle(client);

    expect(instrumented.query).toBe(wrappedQuery);
  });

  it("records a successful query", async () => {
    const client: MockDrizzleClient = {
      query: vi.fn(() => Promise.resolve({ rows: [{ id: 1 }] })),
    };

    instrumentDrizzle(client);

    const result = await client.query("select 1");
    expect(result).toEqual({ rows: [{ id: 1 }] });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }
    expect(span.name).toBe("drizzle.select");
    expect(span.attributes["db.statement"]).toBe("select 1");
    expect(span.attributes["db.operation"]).toBe("SELECT");
    expect(span.attributes["db.system"]).toBe("postgresql");
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("records errors and propagates them", async () => {
    const error = new Error("boom");
    const client: MockDrizzleClient = {
      query: vi.fn(() => Promise.reject(error)),
    };

    instrumentDrizzle(client);

    await expect(client.query("select 1" as unknown)).rejects.toThrow(error);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.some((event) => event.name === "exception")).toBe(true);
  });

  it("supports callback-based queries", () => {
    return new Promise<void>((resolve) => {
      const client: MockDrizzleClient = {
        query: vi.fn((query: unknown, cb: (err: unknown, res: unknown) => void) => {
          cb(null, { ok: true });
          return undefined;
        }),
      };

      instrumentDrizzle(client);

      const returnValue = client.query("select 1", (err: unknown, result: unknown) => {
        expect(err).toBeNull();
        expect(result).toEqual({ ok: true });
        
        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        resolve();
      });
      
      expect(returnValue).toBeUndefined();
    });
  });

  it("respects custom configuration", async () => {
    const client: MockDrizzleClient = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    const config: InstrumentDrizzleConfig = {
      dbSystem: "mysql",
      dbName: "test_db",
      captureQueryText: true,
    };

    instrumentDrizzle(client, config);

    await client.query("SELECT * FROM users");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }
    expect(span.attributes["db.system"]).toBe("mysql");
    expect(span.attributes["db.name"]).toBe("test_db");
    expect(span.attributes["db.statement"]).toBe("SELECT * FROM users");
  });

  it("includes network peer attributes when configured", async () => {
    const client: MockDrizzleClient = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    instrumentDrizzle(client, {
      peerName: 'db.example.com',
      peerPort: 5432,
    });

    await client.query("SELECT 1");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }

    expect(span.attributes["net.peer.name"]).toBe("db.example.com");
    expect(span.attributes["net.peer.port"]).toBe(5432);
  });

  it("truncates long query text", async () => {
    const client: MockDrizzleClient = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    const longQuery = `SELECT ${"a, ".repeat(1000)}b FROM table`;

    instrumentDrizzle(client, { maxQueryTextLength: 50 });

    await client.query(longQuery);

    const spans = exporter.getFinishedSpans();
    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }

    const statement = span.attributes["db.statement"] as string;
    expect(statement.length).toBe(53); // 50 + "..."
    expect(statement.endsWith("...")).toBe(true);
  });

  it("handles query objects with sql property", async () => {
    const client: MockDrizzleClient = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    instrumentDrizzle(client);

    await client.query({ sql: "INSERT INTO users VALUES ($1)", params: ["test"] });

    const spans = exporter.getFinishedSpans();
    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }

    expect(span.name).toBe("drizzle.insert");
    expect(span.attributes["db.operation"]).toBe("INSERT");
    expect(span.attributes["db.statement"]).toBe("INSERT INTO users VALUES ($1)");
  });

  it("handles query objects with text property", async () => {
    const client: MockDrizzleClient = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    instrumentDrizzle(client);

    await client.query({ text: "UPDATE users SET name = $1", values: ["test"] });

    const spans = exporter.getFinishedSpans();
    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }

    expect(span.name).toBe("drizzle.update");
    expect(span.attributes["db.operation"]).toBe("UPDATE");
  });

  it("does not capture query text when disabled", async () => {
    const client: MockDrizzleClient = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    instrumentDrizzle(client, { captureQueryText: false });

    await client.query("SELECT * FROM users");

    const spans = exporter.getFinishedSpans();
    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }

    expect(span.attributes["db.statement"]).toBeUndefined();
    expect(span.attributes["db.operation"]).toBe("SELECT");
  });

  it("handles synchronous errors", () => {
    const error = new Error("sync error");
    const client: MockDrizzleClient = {
      query: vi.fn(() => {
        throw error;
      }),
    };

    instrumentDrizzle(client);

    expect(() => client.query("SELECT 1")).toThrow(error);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("handles callback errors", () => {
    return new Promise<void>((resolve) => {
      const error = new Error("callback error");
      const client: MockDrizzleClient = {
        query: vi.fn((query: unknown, cb: (err: unknown, res: unknown) => void) => {
          cb(error, null);
          return undefined;
        }),
      };

      instrumentDrizzle(client);

      client.query("SELECT 1", (err: unknown) => {
        expect(err).toBe(error);

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
        resolve();
      });
    });
  });

  it("returns client unchanged if query is not a function", () => {
    const client = { query: "not a function" } as any;
    const result = instrumentDrizzle(client);
    expect(result).toBe(client);
    expect(result.query).toBe("not a function");
  });

  it("returns client unchanged if client is null", () => {
    const result = instrumentDrizzle(null as any);
    expect(result).toBeNull();
  });
});
