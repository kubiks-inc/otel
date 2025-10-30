import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type {
  Collection,
  Db,
  MongoClient,
  Document,
  FindCursor,
  AggregationCursor,
} from "mongodb";
import {
  instrumentCollection,
  instrumentDb,
  instrumentMongoClient,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_MONGODB_COLLECTION,
  SEMATTRS_MONGODB_RESULT_COUNT,
  SEMATTRS_MONGODB_MATCHED_COUNT,
  SEMATTRS_MONGODB_MODIFIED_COUNT,
  SEMATTRS_MONGODB_DELETED_COUNT,
  SEMATTRS_MONGODB_INSERTED_COUNT,
  SEMATTRS_MONGODB_FILTER,
  SEMATTRS_DB_NAME,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from "./index";

describe("instrumentCollection", () => {
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

  const createMockCollection = (name = "users"): Collection<Document> => {
    const mockCursor = {
      toArray: vi.fn(async () => [{ _id: "1", name: "John" }]),
    } as unknown as FindCursor<any>;

    const mockAggCursor = {
      toArray: vi.fn(async () => [{ count: 5 }]),
    } as unknown as AggregationCursor<any>;

    return {
      collectionName: name,
      find: vi.fn(() => mockCursor),
      findOne: vi.fn(async () => ({ _id: "1", name: "John" })),
      insertOne: vi.fn(async () => ({
        acknowledged: true,
        insertedId: "1",
      })),
      insertMany: vi.fn(async () => ({
        acknowledged: true,
        insertedCount: 3,
        insertedIds: { 0: "1", 1: "2", 2: "3" },
      })),
      updateOne: vi.fn(async () => ({
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
        upsertedCount: 0,
        upsertedId: null,
      })),
      updateMany: vi.fn(async () => ({
        acknowledged: true,
        matchedCount: 5,
        modifiedCount: 5,
        upsertedCount: 0,
        upsertedId: null,
      })),
      deleteOne: vi.fn(async () => ({
        acknowledged: true,
        deletedCount: 1,
      })),
      deleteMany: vi.fn(async () => ({
        acknowledged: true,
        deletedCount: 10,
      })),
      countDocuments: vi.fn(async () => 42),
      aggregate: vi.fn(() => mockAggCursor),
      replaceOne: vi.fn(async () => ({
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
        upsertedCount: 0,
        upsertedId: null,
      })),
      findOneAndUpdate: vi.fn(async () => ({
        value: { _id: "1", name: "Updated" },
        ok: 1,
      })),
      findOneAndDelete: vi.fn(async () => ({
        value: { _id: "1", name: "John" },
        ok: 1,
      })),
      findOneAndReplace: vi.fn(async () => ({
        value: { _id: "1", name: "Replaced" },
        ok: 1,
      })),
    } as unknown as Collection<Document>;
  };

  it("instruments findOne and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection, { dbName: "testdb" });

    const result = await collection.findOne({ email: "test@example.com" });
    expect(result).toEqual({ _id: "1", name: "John" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.findOne");
    expect(span.attributes[SEMATTRS_DB_SYSTEM]).toBe("mongodb");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("findOne");
    expect(span.attributes[SEMATTRS_DB_MONGODB_COLLECTION]).toBe("users");
    expect(span.attributes[SEMATTRS_DB_NAME]).toBe("testdb");
    expect(span.attributes[SEMATTRS_MONGODB_RESULT_COUNT]).toBe(1);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments find with toArray and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection);

    const cursor = collection.find({ status: "active" });
    const results = await cursor.toArray();
    expect(results).toHaveLength(1);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.find");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("find");
    expect(span.attributes[SEMATTRS_MONGODB_RESULT_COUNT]).toBe(1);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("captures filter when captureFilters is enabled", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection, {
      captureFilters: true,
      dbName: "testdb",
    });

    await collection.findOne({ email: "test@example.com", status: "active" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    const filter = span.attributes[SEMATTRS_MONGODB_FILTER] as string;
    expect(filter).toBeDefined();
    expect(filter).toContain("test@example.com");
    expect(filter).toContain("active");
  });

  it("does not capture filter when captureFilters is disabled", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection, {
      captureFilters: false,
      dbName: "testdb",
    });

    await collection.findOne({ email: "test@example.com" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_MONGODB_FILTER]).toBeUndefined();
  });

  it("truncates long filters based on maxFilterLength", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection, {
      captureFilters: true,
      maxFilterLength: 50,
    });

    const longFilter = { data: "x".repeat(100), field: "value" };
    await collection.findOne(longFilter);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    const capturedFilter = span.attributes[SEMATTRS_MONGODB_FILTER] as string;
    expect(capturedFilter).toBeDefined();
    expect(capturedFilter.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(capturedFilter).toContain("...");
  });

  it("instruments insertOne and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection);

    const result = await collection.insertOne({
      name: "Jane",
      email: "jane@example.com",
    });
    expect(result.acknowledged).toBe(true);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.insertOne");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("insertOne");
    expect(span.attributes[SEMATTRS_MONGODB_INSERTED_COUNT]).toBe(1);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments insertMany and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection);

    const result = await collection.insertMany([
      { name: "User1" },
      { name: "User2" },
      { name: "User3" },
    ]);
    expect(result.insertedCount).toBe(3);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.insertMany");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("insertMany");
    expect(span.attributes[SEMATTRS_MONGODB_INSERTED_COUNT]).toBe(3);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments updateOne and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection);

    const result = await collection.updateOne({ _id: "1" } as any, {
      $set: { name: "Updated" },
    });
    expect(result.modifiedCount).toBe(1);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.updateOne");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("updateOne");
    expect(span.attributes[SEMATTRS_MONGODB_MATCHED_COUNT]).toBe(1);
    expect(span.attributes[SEMATTRS_MONGODB_MODIFIED_COUNT]).toBe(1);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments updateMany and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection);

    const result = await collection.updateMany(
      { status: "pending" },
      { $set: { status: "processed" } }
    );
    expect(result.modifiedCount).toBe(5);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.updateMany");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("updateMany");
    expect(span.attributes[SEMATTRS_MONGODB_MATCHED_COUNT]).toBe(5);
    expect(span.attributes[SEMATTRS_MONGODB_MODIFIED_COUNT]).toBe(5);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments deleteOne and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection);

    const result = await collection.deleteOne({ _id: "1" } as any);
    expect(result.deletedCount).toBe(1);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.deleteOne");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("deleteOne");
    expect(span.attributes[SEMATTRS_MONGODB_DELETED_COUNT]).toBe(1);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments deleteMany and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection);

    const result = await collection.deleteMany({ status: "deleted" });
    expect(result.deletedCount).toBe(10);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.deleteMany");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("deleteMany");
    expect(span.attributes[SEMATTRS_MONGODB_DELETED_COUNT]).toBe(10);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments countDocuments and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection);

    const count = await collection.countDocuments({ status: "active" });
    expect(count).toBe(42);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.countDocuments");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("countDocuments");
    expect(span.attributes[SEMATTRS_MONGODB_RESULT_COUNT]).toBe(42);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments aggregate and records span", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection, { captureFilters: true });

    const pipeline = [
      { $match: { status: "active" } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ];
    const cursor = collection.aggregate(pipeline);
    const results = await cursor.toArray();
    expect(results).toHaveLength(1);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.aggregate");
    expect(span.attributes[SEMATTRS_DB_OPERATION]).toBe("aggregate");
    expect(span.attributes[SEMATTRS_MONGODB_RESULT_COUNT]).toBe(1);
    expect(span.status.code).toBe(SpanStatusCode.OK);

    const pipelineAttr = span.attributes["mongodb.pipeline"] as string;
    expect(pipelineAttr).toBeDefined();
    expect(pipelineAttr).toContain("active");
  });

  it("includes network peer attributes when configured", async () => {
    const collection = createMockCollection("users");
    instrumentCollection(collection, {
      peerName: "mongodb.example.com",
      peerPort: 27017,
    });

    await collection.findOne({ _id: "1" } as any);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_NET_PEER_NAME]).toBe("mongodb.example.com");
    expect(span.attributes[SEMATTRS_NET_PEER_PORT]).toBe(27017);
  });

  it("handles errors and marks span status", async () => {
    const collection = createMockCollection("users");
    collection.findOne = vi
      .fn()
      .mockRejectedValue(new Error("Connection error"));

    instrumentCollection(collection);

    await expect(collection.findOne({ _id: "1" } as any)).rejects.toThrowError(
      "Connection error"
    );

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    const hasException = span.events.some(
      (event: any) => event.name === "exception"
    );
    expect(hasException).toBe(true);
  });

  it("handles findOne returning null", async () => {
    const collection = createMockCollection("users");
    collection.findOne = vi.fn(async () => null);

    instrumentCollection(collection);

    const result = await collection.findOne({ _id: "nonexistent" } as any);
    expect(result).toBeNull();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_MONGODB_RESULT_COUNT]).toBe(0);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("is idempotent - does not instrument twice", () => {
    const collection = createMockCollection("users");

    const first = instrumentCollection(collection);
    const originalFindOne = first.findOne;

    const second = instrumentCollection(first);
    expect(second.findOne).toBe(originalFindOne);
  });

  it("returns collection unchanged if null", () => {
    const result = instrumentCollection(null as any);
    expect(result).toBeNull();
  });

  it("handles cursor errors in find.toArray", async () => {
    const collection = createMockCollection("users");
    const mockCursor = {
      toArray: vi.fn().mockRejectedValue(new Error("Cursor error")),
    } as unknown as FindCursor<any>;

    collection.find = vi.fn(() => mockCursor);
    instrumentCollection(collection);

    const cursor = collection.find({});
    await expect(cursor.toArray()).rejects.toThrowError("Cursor error");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("handles cursor errors in aggregate.toArray", async () => {
    const collection = createMockCollection("users");
    const mockCursor = {
      toArray: vi.fn().mockRejectedValue(new Error("Aggregation error")),
    } as unknown as AggregationCursor<any>;

    collection.aggregate = vi.fn(() => mockCursor);
    instrumentCollection(collection);

    const cursor = collection.aggregate([]);
    await expect(cursor.toArray()).rejects.toThrowError("Aggregation error");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });
});

describe("instrumentDb", () => {
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

  const createMockDb = (dbName = "testdb"): Db => {
    // Helper to create a new mock collection for each call
    const createCollectionMock = (name: string): Collection<Document> => {
      const mockCursor = {
        toArray: vi.fn(async () => [{ _id: "1", name: "John" }]),
      } as unknown as FindCursor<any>;

      const mockAggCursor = {
        toArray: vi.fn(async () => [{ count: 5 }]),
      } as unknown as AggregationCursor<any>;

      return {
        collectionName: name,
        find: vi.fn(() => mockCursor),
        findOne: vi.fn(async () => ({ _id: "1", name: "John" })),
        insertOne: vi.fn(async () => ({
          acknowledged: true,
          insertedId: "1",
        })),
        insertMany: vi.fn(async () => ({
          acknowledged: true,
          insertedCount: 3,
          insertedIds: { 0: "1", 1: "2", 2: "3" },
        })),
        updateOne: vi.fn(async () => ({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
          upsertedId: null,
        })),
        updateMany: vi.fn(async () => ({
          acknowledged: true,
          matchedCount: 5,
          modifiedCount: 5,
          upsertedCount: 0,
          upsertedId: null,
        })),
        deleteOne: vi.fn(async () => ({
          acknowledged: true,
          deletedCount: 1,
        })),
        deleteMany: vi.fn(async () => ({
          acknowledged: true,
          deletedCount: 10,
        })),
        countDocuments: vi.fn(async () => 42),
        aggregate: vi.fn(() => mockAggCursor),
        replaceOne: vi.fn(async () => ({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
          upsertedId: null,
        })),
        findOneAndUpdate: vi.fn(async () => ({
          value: { _id: "1", name: "Updated" },
          ok: 1,
        })),
        findOneAndDelete: vi.fn(async () => ({
          value: { _id: "1", name: "John" },
          ok: 1,
        })),
        findOneAndReplace: vi.fn(async () => ({
          value: { _id: "1", name: "Replaced" },
          ok: 1,
        })),
      } as unknown as Collection<Document>;
    };

    return {
      databaseName: dbName,
      collection: vi.fn((name: string) => createCollectionMock(name)),
    } as unknown as Db;
  };

  it("instruments db and auto-instruments collections", async () => {
    const db = createMockDb("myapp");
    instrumentDb(db, { captureFilters: true });

    const users = db.collection("users");
    await users.findOne({ email: "test@example.com" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.findOne");
    expect(span.attributes[SEMATTRS_DB_NAME]).toBe("myapp");
  });

  it("uses database name from db if not provided in config", async () => {
    const db = createMockDb("autodb");
    instrumentDb(db);

    const users = db.collection("users");
    await users.findOne({});

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_DB_NAME]).toBe("autodb");
  });

  it("is idempotent - does not instrument twice", () => {
    const db = createMockDb();

    const first = instrumentDb(db);
    const originalCollection = first.collection;

    const second = instrumentDb(first);
    expect(second.collection).toBe(originalCollection);
  });

  it("returns db unchanged if null", () => {
    const result = instrumentDb(null as any);
    expect(result).toBeNull();
  });
});

describe("instrumentMongoClient", () => {
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

  const createMockClient = (): MongoClient => {
    // Helper to create a new mock collection for each call
    const createCollectionMock = (name: string): Collection<Document> => {
      const mockCursor = {
        toArray: vi.fn(async () => [{ _id: "1", name: "John" }]),
      } as unknown as FindCursor<any>;

      const mockAggCursor = {
        toArray: vi.fn(async () => [{ count: 5 }]),
      } as unknown as AggregationCursor<any>;

      return {
        collectionName: name,
        find: vi.fn(() => mockCursor),
        findOne: vi.fn(async () => ({ _id: "1", name: "John" })),
        insertOne: vi.fn(async () => ({
          acknowledged: true,
          insertedId: "1",
        })),
        insertMany: vi.fn(async () => ({
          acknowledged: true,
          insertedCount: 3,
          insertedIds: { 0: "1", 1: "2", 2: "3" },
        })),
        updateOne: vi.fn(async () => ({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
          upsertedId: null,
        })),
        updateMany: vi.fn(async () => ({
          acknowledged: true,
          matchedCount: 5,
          modifiedCount: 5,
          upsertedCount: 0,
          upsertedId: null,
        })),
        deleteOne: vi.fn(async () => ({
          acknowledged: true,
          deletedCount: 1,
        })),
        deleteMany: vi.fn(async () => ({
          acknowledged: true,
          deletedCount: 10,
        })),
        countDocuments: vi.fn(async () => 42),
        aggregate: vi.fn(() => mockAggCursor),
        replaceOne: vi.fn(async () => ({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
          upsertedId: null,
        })),
        findOneAndUpdate: vi.fn(async () => ({
          value: { _id: "1", name: "Updated" },
          ok: 1,
        })),
        findOneAndDelete: vi.fn(async () => ({
          value: { _id: "1", name: "John" },
          ok: 1,
        })),
        findOneAndReplace: vi.fn(async () => ({
          value: { _id: "1", name: "Replaced" },
          ok: 1,
        })),
      } as unknown as Collection<Document>;
    };

    const createDbMock = (dbName: string): Db => {
      return {
        databaseName: dbName,
        collection: vi.fn((name: string) => createCollectionMock(name)),
      } as unknown as Db;
    };

    return {
      db: vi.fn((name?: string) => createDbMock(name || "testdb")),
    } as unknown as MongoClient;
  };

  it("instruments client and auto-instruments databases and collections", async () => {
    const client = createMockClient();
    instrumentMongoClient(client, {
      captureFilters: true,
      peerName: "localhost",
      peerPort: 27017,
    });

    const db = client.db("testdb");
    const users = db.collection("users");
    await users.findOne({ email: "test@example.com" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("mongodb.users.findOne");
    expect(span.attributes[SEMATTRS_DB_NAME]).toBe("testdb");
    expect(span.attributes[SEMATTRS_NET_PEER_NAME]).toBe("localhost");
    expect(span.attributes[SEMATTRS_NET_PEER_PORT]).toBe(27017);
  });

  it("is idempotent - does not instrument twice", () => {
    const client = createMockClient();

    const first = instrumentMongoClient(client);
    const originalDb = first.db;

    const second = instrumentMongoClient(first);
    expect(second.db).toBe(originalDb);
  });

  it("returns client unchanged if null", () => {
    const result = instrumentMongoClient(null as any);
    expect(result).toBeNull();
  });
});
