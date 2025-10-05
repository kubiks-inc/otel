import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { instrumentDrizzle, instrumentDrizzleClient, type InstrumentDrizzleConfig } from "./index";

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

  it("instruments a client with execute method instead of query", async () => {
    const client = {
      execute: vi.fn(() => Promise.resolve({ rows: [{ id: 1 }] })),
    };

    instrumentDrizzle(client);

    // Execute with SQL object format (used by various drivers)
    const result = await client.execute({
      sql: "SELECT * FROM users WHERE id = ?",
      args: [1],
    });
    
    expect(result).toEqual({ rows: [{ id: 1 }] });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    
    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }
    
    expect(span.name).toBe("drizzle.select");
    expect(span.attributes["db.statement"]).toBe("SELECT * FROM users WHERE id = ?");
    expect(span.attributes["db.operation"]).toBe("SELECT");
  });

  it("instruments a client with execute method using string query", async () => {
    const client = {
      execute: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    instrumentDrizzle(client);

    await client.execute("DELETE FROM users");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    
    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }
    
    expect(span.name).toBe("drizzle.delete");
    expect(span.attributes["db.operation"]).toBe("DELETE");
    expect(span.attributes["db.statement"]).toBe("DELETE FROM users");
  });
});

describe("instrumentDrizzleClient", () => {
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

  it("instruments a db with session.prepareQuery method", async () => {
    const mockPreparedQuery = {
      execute: vi.fn(() => Promise.resolve({ rows: [{ id: 1 }] })),
    };
    
    const mockSession = {
      prepareQuery: vi.fn(() => mockPreparedQuery),
    };
    
    const mockDb = {
      session: mockSession,
      select: vi.fn(),
    };

    const instrumented = instrumentDrizzleClient(mockDb);
    expect(instrumented).toBe(mockDb);

    // Simulate what happens when db.select().from() is called
    const prepared = mockSession.prepareQuery({ sql: "SELECT * FROM users" });
    const result = await prepared.execute();
    expect(result).toEqual({ rows: [{ id: 1 }] });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("drizzle.select");
    expect(spans[0]?.attributes["db.statement"]).toBe("SELECT * FROM users");
  });

  it("instruments a db with $client property as fallback", async () => {
    const mockClient = {
      query: vi.fn(() => Promise.resolve({ rows: [{ id: 1 }] })),
    };

    const mockDb = {
      $client: mockClient,
      select: vi.fn(),
      // No direct execute method
    };

    const instrumented = instrumentDrizzleClient(mockDb);
    expect(instrumented).toBe(mockDb);

    // Execute a query through the client
    const result = await mockClient.query("SELECT * FROM users");
    expect(result).toEqual({ rows: [{ id: 1 }] });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("drizzle.select");
    expect(spans[0]?.attributes["db.statement"]).toBe("SELECT * FROM users");
  });

  it("instruments a db with _.session.execute property", async () => {
    const mockSession = {
      execute: vi.fn(() => Promise.resolve({ rows: [{ id: 2 }] })),
    };

    const mockDb = {
      _: {
        session: mockSession,
      },
      select: vi.fn(),
    };

    const instrumented = instrumentDrizzleClient(mockDb);
    expect(instrumented).toBe(mockDb);

    // Execute a query through the session
    const result = await mockSession.execute("INSERT INTO users (name) VALUES ('test')");
    expect(result).toEqual({ rows: [{ id: 2 }] });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("drizzle.insert");
    expect(spans[0]?.attributes["db.operation"]).toBe("INSERT");
  });

  it("instruments session.query method", async () => {
    const mockSession = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };
    
    const mockDb = {
      session: mockSession,
    };

    instrumentDrizzleClient(mockDb);

    // Direct query through session
    await mockSession.query("INSERT INTO users (name) VALUES ($1)", ["John"]);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("drizzle.insert");
    expect(spans[0]?.attributes["db.statement"]).toBe("INSERT INTO users (name) VALUES ($1)");
  });

  it("only instruments once when called multiple times", async () => {
    const mockClient = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    const mockDb = {
      $client: mockClient,
    };

    const firstInstrumented = instrumentDrizzleClient(mockDb);
    const wrappedQuery = mockClient.query;
    
    const secondInstrumented = instrumentDrizzleClient(mockDb);
    
    expect(firstInstrumented).toBe(mockDb);
    expect(secondInstrumented).toBe(mockDb);
    expect(mockClient.query).toBe(wrappedQuery);
  });

  it("respects custom configuration", async () => {
    const mockClient = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    const mockDb = {
      $client: mockClient,
    };

    const config: InstrumentDrizzleConfig = {
      dbSystem: "mysql",
      dbName: "test_db",
      peerName: "db.example.com",
      peerPort: 3306,
    };

    instrumentDrizzleClient(mockDb, config);

    await mockClient.query("SELECT 1");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    
    const span = spans[0];
    if (!span) {
      throw new Error("Expected a recorded span");
    }

    expect(span.attributes["db.system"]).toBe("mysql");
    expect(span.attributes["db.name"]).toBe("test_db");
    expect(span.attributes["net.peer.name"]).toBe("db.example.com");
    expect(span.attributes["net.peer.port"]).toBe(3306);
  });

  it("returns db unchanged if db is null", () => {
    const result = instrumentDrizzleClient(null as any);
    expect(result).toBeNull();
  });

  it("returns db unchanged if no instrumentable properties exist", () => {
    const mockDb = {
      select: vi.fn(),
      // No $client or _.session properties
    };

    const result = instrumentDrizzleClient(mockDb);
    expect(result).toBe(mockDb);
  });

  it("handles errors in session.execute", async () => {
    const error = new Error("database error");
    const mockSession = {
      execute: vi.fn(() => Promise.reject(error)),
    };

    const mockDb = {
      _: {
        session: mockSession,
      },
    };

    instrumentDrizzleClient(mockDb);

    await expect(mockSession.execute("DELETE FROM users")).rejects.toThrow(error);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("instruments transaction execute calls", async () => {
    let txObject: any;
    
    const mockSession = {
      transaction: vi.fn(async (callback: any) => {
        // Create a mock transaction object
        txObject = {
          execute: vi.fn(() => Promise.resolve({ rows: [] })),
        };
        return callback(txObject);
      }),
    };
    
    const mockDb = {
      session: mockSession,
    };

    instrumentDrizzleClient(mockDb);

    // Execute a transaction with RLS queries
    await mockSession.transaction(async (tx: any) => {
      await tx.execute({ sql: "SET LOCAL role org_role" });
      await tx.execute({ sql: "SELECT set_config('request.org_id', $1, true)", params: ["org123"] });
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0]?.name).toBe("drizzle.set");
    expect(spans[0]?.attributes["db.statement"]).toBe("SET LOCAL role org_role");
    expect(spans[0]?.attributes["db.transaction"]).toBe(true);
    expect(spans[1]?.name).toBe("drizzle.select");
    expect(spans[1]?.attributes["db.transaction"]).toBe(true);
  });

  it("only instruments session once when called multiple times", () => {
    const mockSession = {
      execute: vi.fn(() => Promise.resolve({ rows: [] })),
    };

    const mockDb = {
      _: {
        session: mockSession,
      },
    };

    instrumentDrizzleClient(mockDb);
    const wrappedExecute = mockSession.execute;

    instrumentDrizzleClient(mockDb);
    
    expect(mockSession.execute).toBe(wrappedExecute);
  });
});
