import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { instrumentClickHouse, type InstrumentClickHouseConfig } from "./index";

interface MockClickHouseClient {
  query: (params: any) => Promise<any>;
  insert: (params: any) => Promise<any>;
  exec: (params: any) => Promise<any>;
  command: (params: any) => Promise<any>;
}

describe("instrumentClickHouse", () => {
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

  it("wraps all methods only once", () => {
    const client = {
      query: vi.fn(),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any);

    expect(instrumented.query).not.toBeUndefined();
    expect(instrumented.insert).not.toBeUndefined();
    expect(instrumented.exec).not.toBeUndefined();
    expect(instrumented.command).not.toBeUndefined();
    
    const wrappedQuery = instrumented.query;
    const wrappedInsert = instrumented.insert;
    const wrappedExec = instrumented.exec;
    const wrappedCommand = instrumented.command;

    instrumentClickHouse(client as any);

    expect(instrumented.query).toBe(wrappedQuery);
    expect(instrumented.insert).toBe(wrappedInsert);
    expect(instrumented.exec).toBe(wrappedExec);
    expect(instrumented.command).toBe(wrappedCommand);
  });

  it("records a successful query", async () => {
    const client = {
      query: vi.fn(() =>
        Promise.resolve({
          response_headers: {
            "x-clickhouse-summary": JSON.stringify({
              read_rows: "1000",
              read_bytes: "8192",
              written_rows: "0",
              written_bytes: "0",
              total_rows_to_read: "1000",
              result_rows: "50",
              result_bytes: "2048",
              elapsed_ns: "1500000",
            }),
          },
        })
      ),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any);

    await instrumented.query({ query: "SELECT * FROM users" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.name).toBe("clickhouse.select");
    expect(span.status.code).toBe(SpanStatusCode.OK);
    expect(span.attributes["db.system"]).toBe("clickhouse");
    expect(span.attributes["db.operation"]).toBe("SELECT");
    expect(span.attributes["db.statement"]).toBe("SELECT * FROM users");
  });

  it("captures execution statistics", async () => {
    const client = {
      query: vi.fn(() =>
        Promise.resolve({
          response_headers: {
            "x-clickhouse-summary": JSON.stringify({
              read_rows: "1000",
              read_bytes: "8192",
              written_rows: "0",
              written_bytes: "0",
              total_rows_to_read: "1000",
              result_rows: "50",
              result_bytes: "2048",
              elapsed_ns: "1500000",
            }),
          },
        })
      ),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any, {
      captureExecutionStats: true,
    });

    await instrumented.query({ query: "SELECT * FROM users" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.attributes["clickhouse.read_rows"]).toBe(1000);
    expect(span.attributes["clickhouse.read_bytes"]).toBe(8192);
    expect(span.attributes["clickhouse.result_rows"]).toBe(50);
    expect(span.attributes["clickhouse.result_bytes"]).toBe(2048);
    expect(span.attributes["clickhouse.elapsed_ns"]).toBe(1500000);
  });

  it("records a failed query", async () => {
    const error = new Error("Query failed");
    const client = {
      query: vi.fn(() => Promise.reject(error)),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any);

    await expect(
      instrumented.query({ query: "SELECT * FROM users" })
    ).rejects.toThrow("Query failed");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.name).toBe("clickhouse.select");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe("exception");
  });

  it("respects captureQueryText option", async () => {
    const client = {
      query: vi.fn(() => Promise.resolve({ response_headers: {} })),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any, {
      captureQueryText: false,
    });

    await instrumented.query({ query: "SELECT * FROM users" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.attributes["db.statement"]).toBeUndefined();
  });

  it("truncates long queries", async () => {
    const longQuery = "SELECT * FROM users WHERE " + "a = 1 AND ".repeat(200);
    const client = {
      query: vi.fn(() => Promise.resolve({ response_headers: {} })),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any, {
      maxQueryTextLength: 100,
    });

    await instrumented.query({ query: longQuery });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    const statement = span.attributes["db.statement"] as string;
    expect(statement.length).toBeLessThanOrEqual(103); // 100 + "..."
    expect(statement).toContain("...");
  });

  it("includes database name when configured", async () => {
    const client = {
      query: vi.fn(() => Promise.resolve({ response_headers: {} })),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any, {
      dbName: "analytics",
    });

    await instrumented.query({ query: "SELECT * FROM users" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.attributes["db.name"]).toBe("analytics");
  });

  it("includes network metadata when configured", async () => {
    const client = {
      query: vi.fn(() => Promise.resolve({ response_headers: {} })),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any, {
      peerName: "clickhouse.example.com",
      peerPort: 8123,
    });

    await instrumented.query({ query: "SELECT * FROM users" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.attributes["net.peer.name"]).toBe("clickhouse.example.com");
    expect(span.attributes["net.peer.port"]).toBe(8123);
  });

  it("detects different operation types", async () => {
    const client = {
      query: vi.fn(() => Promise.resolve({ response_headers: {} })),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any);

    await instrumented.query({ query: "INSERT INTO users VALUES (1, 'test')" });
    await instrumented.query({ query: "UPDATE users SET name = 'test'" });
    await instrumented.query({ query: "DELETE FROM users WHERE id = 1" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);

    expect(spans[0].name).toBe("clickhouse.insert");
    expect(spans[0].attributes["db.operation"]).toBe("INSERT");

    expect(spans[1].name).toBe("clickhouse.update");
    expect(spans[1].attributes["db.operation"]).toBe("UPDATE");

    expect(spans[2].name).toBe("clickhouse.delete");
    expect(spans[2].attributes["db.operation"]).toBe("DELETE");
  });

  it("handles queries without execution stats", async () => {
    const client = {
      query: vi.fn(() => Promise.resolve({ response_headers: {} })),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any, {
      captureExecutionStats: true,
    });

    await instrumented.query({ query: "SELECT * FROM users" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.status.code).toBe(SpanStatusCode.OK);
    // Stats should not be present
    expect(span.attributes["clickhouse.read_rows"]).toBeUndefined();
  });

  it("skips execution stats when disabled", async () => {
    const client = {
      query: vi.fn(() =>
        Promise.resolve({
          response_headers: {
            "x-clickhouse-summary": JSON.stringify({
              read_rows: "1000",
              read_bytes: "8192",
            }),
          },
        })
      ),
      insert: vi.fn(),
      exec: vi.fn(),
      command: vi.fn(),
    } as unknown as MockClickHouseClient;

    const instrumented = instrumentClickHouse(client as any, {
      captureExecutionStats: false,
    });

    await instrumented.query({ query: "SELECT * FROM users" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.attributes["clickhouse.read_rows"]).toBeUndefined();
  });

  describe("insert instrumentation", () => {
    it("records a successful insert", async () => {
      const client = {
        query: vi.fn(),
        insert: vi.fn(() =>
          Promise.resolve({
            executed: true,
            query_id: "test-query-id",
            response_headers: {
              "x-clickhouse-summary": JSON.stringify({
                read_rows: "0",
                read_bytes: "0",
                written_rows: "100",
                written_bytes: "4096",
                total_rows_to_read: "0",
                result_rows: "0",
                result_bytes: "0",
                elapsed_ns: "500000",
              }),
            },
          })
        ),
        exec: vi.fn(),
        command: vi.fn(),
      } as unknown as MockClickHouseClient;

      const instrumented = instrumentClickHouse(client as any);

      await instrumented.insert({
        table: "users",
        values: [{ id: 1, name: "Alice" }],
        format: "JSONEachRow",
      });

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("clickhouse.insert");
      expect(span.status.code).toBe(SpanStatusCode.OK);
      expect(span.attributes["db.system"]).toBe("clickhouse");
      expect(span.attributes["db.operation"]).toBe("INSERT");
      expect(span.attributes["db.statement"]).toBe(
        "INSERT INTO users FORMAT JSONEachRow"
      );
      expect(span.attributes["clickhouse.written_rows"]).toBe(100);
      expect(span.attributes["clickhouse.written_bytes"]).toBe(4096);
    });

    it("records insert with columns", async () => {
      const client = {
        query: vi.fn(),
        insert: vi.fn(() =>
          Promise.resolve({
            executed: true,
            query_id: "test-query-id",
            response_headers: {},
          })
        ),
        exec: vi.fn(),
        command: vi.fn(),
      } as unknown as MockClickHouseClient;

      const instrumented = instrumentClickHouse(client as any);

      await instrumented.insert({
        table: "users",
        values: [{ id: 1, name: "Alice" }],
        format: "JSONEachRow",
        columns: ["id", "name"],
      });

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.attributes["db.statement"]).toBe(
        "INSERT INTO users (id, name) FORMAT JSONEachRow"
      );
    });

    it("records insert with except columns", async () => {
      const client = {
        query: vi.fn(),
        insert: vi.fn(() =>
          Promise.resolve({
            executed: true,
            query_id: "test-query-id",
            response_headers: {},
          })
        ),
        exec: vi.fn(),
        command: vi.fn(),
      } as unknown as MockClickHouseClient;

      const instrumented = instrumentClickHouse(client as any);

      await instrumented.insert({
        table: "users",
        values: [{ id: 1, name: "Alice" }],
        columns: { except: ["created_at"] },
      });

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.attributes["db.statement"]).toBe(
        "INSERT INTO users (* EXCEPT (created_at)) FORMAT JSONCompactEachRow"
      );
    });

    it("records a failed insert", async () => {
      const error = new Error("Insert failed");
      const client = {
        query: vi.fn(),
        insert: vi.fn(() => Promise.reject(error)),
        exec: vi.fn(),
        command: vi.fn(),
      } as unknown as MockClickHouseClient;

      const instrumented = instrumentClickHouse(client as any);

      await expect(
        instrumented.insert({
          table: "users",
          values: [{ id: 1, name: "Alice" }],
        })
      ).rejects.toThrow("Insert failed");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("clickhouse.insert");
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe("exception");
    });
  });

  describe("exec instrumentation", () => {
    it("records a successful exec", async () => {
      const client = {
        query: vi.fn(),
        insert: vi.fn(),
        exec: vi.fn(() =>
          Promise.resolve({
            query_id: "test-query-id",
            stream: {},
          })
        ),
        command: vi.fn(),
      } as unknown as MockClickHouseClient;

      const instrumented = instrumentClickHouse(client as any);

      await instrumented.exec({
        query: "INSERT INTO users FORMAT JSONEachRow",
      });

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("clickhouse.insert");
      expect(span.status.code).toBe(SpanStatusCode.OK);
      expect(span.attributes["db.system"]).toBe("clickhouse");
      expect(span.attributes["db.operation"]).toBe("INSERT");
      expect(span.attributes["db.statement"]).toBe(
        "INSERT INTO users FORMAT JSONEachRow"
      );
    });

    it("records a failed exec", async () => {
      const error = new Error("Exec failed");
      const client = {
        query: vi.fn(),
        insert: vi.fn(),
        exec: vi.fn(() => Promise.reject(error)),
        command: vi.fn(),
      } as unknown as MockClickHouseClient;

      const instrumented = instrumentClickHouse(client as any);

      await expect(
        instrumented.exec({ query: "CREATE TABLE test (id UInt32)" })
      ).rejects.toThrow("Exec failed");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe("exception");
    });
  });

  describe("command instrumentation", () => {
    it("records a successful command", async () => {
      const client = {
        query: vi.fn(),
        insert: vi.fn(),
        exec: vi.fn(),
        command: vi.fn(() =>
          Promise.resolve({
            query_id: "test-query-id",
            response_headers: {
              "x-clickhouse-summary": JSON.stringify({
                read_rows: "0",
                read_bytes: "0",
                written_rows: "0",
                written_bytes: "0",
                total_rows_to_read: "0",
                result_rows: "0",
                result_bytes: "0",
                elapsed_ns: "100000",
              }),
            },
          })
        ),
      } as unknown as MockClickHouseClient;

      const instrumented = instrumentClickHouse(client as any);

      await instrumented.command({
        query: "CREATE TABLE test (id UInt32) ENGINE = Memory",
      });

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("clickhouse.create");
      expect(span.status.code).toBe(SpanStatusCode.OK);
      expect(span.attributes["db.system"]).toBe("clickhouse");
      expect(span.attributes["db.operation"]).toBe("CREATE");
      expect(span.attributes["db.statement"]).toBe(
        "CREATE TABLE test (id UInt32) ENGINE = Memory"
      );
      expect(span.attributes["clickhouse.elapsed_ns"]).toBe(100000);
    });

    it("records a failed command", async () => {
      const error = new Error("Command failed");
      const client = {
        query: vi.fn(),
        insert: vi.fn(),
        exec: vi.fn(),
        command: vi.fn(() => Promise.reject(error)),
      } as unknown as MockClickHouseClient;

      const instrumented = instrumentClickHouse(client as any);

      await expect(
        instrumented.command({ query: "DROP TABLE test" })
      ).rejects.toThrow("Command failed");

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.name).toBe("clickhouse.drop");
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe("exception");
    });
  });
});
