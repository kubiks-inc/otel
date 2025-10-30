import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import type {
  Collection,
  Db,
  MongoClient,
  Document,
  Filter,
  UpdateFilter,
  OptionalUnlessRequiredId,
  WithId,
  WithoutId,
  DeleteResult,
  UpdateResult,
  InsertOneResult,
  InsertManyResult,
  FindCursor,
  AggregationCursor,
  CountDocumentsOptions,
  FindOptions,
} from "mongodb";

const DEFAULT_TRACER_NAME = "@kubiks/otel-mongodb";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelMongoDBInstrumented");
const COMMAND_SPAN_MAP = Symbol("kubiksOtelMongoDBCommandSpanMap");

// Semantic conventions for database attributes
export const SEMATTRS_DB_SYSTEM = "db.system" as const;
export const SEMATTRS_DB_OPERATION = "db.operation" as const;
export const SEMATTRS_DB_NAME = "db.name" as const;
export const SEMATTRS_DB_MONGODB_COLLECTION = "db.mongodb.collection" as const;
export const SEMATTRS_DB_STATEMENT = "db.statement" as const;
export const SEMATTRS_NET_PEER_NAME = "net.peer.name" as const;
export const SEMATTRS_NET_PEER_PORT = "net.peer.port" as const;

// MongoDB-specific attributes
export const SEMATTRS_MONGODB_FILTER = "mongodb.filter" as const;
export const SEMATTRS_MONGODB_RESULT_COUNT = "mongodb.result_count" as const;
export const SEMATTRS_MONGODB_MATCHED_COUNT = "mongodb.matched_count" as const;
export const SEMATTRS_MONGODB_MODIFIED_COUNT =
  "mongodb.modified_count" as const;
export const SEMATTRS_MONGODB_DELETED_COUNT = "mongodb.deleted_count" as const;
export const SEMATTRS_MONGODB_INSERTED_COUNT =
  "mongodb.inserted_count" as const;
export const SEMATTRS_MONGODB_UPSERTED_COUNT =
  "mongodb.upserted_count" as const;

// MongoDB execution stats attributes
export const SEMATTRS_MONGODB_EXECUTION_TIME_MS =
  "mongodb.execution_time_ms" as const;

/**
 * Configuration options for MongoDB instrumentation.
 */
export interface InstrumentMongoDBConfig {
  /**
   * Custom tracer name. Defaults to "@kubiks/otel-mongodb".
   */
  tracerName?: string;

  /**
   * Database name to include in spans.
   */
  dbName?: string;

  /**
   * Whether to capture query filters in spans.
   * Defaults to false for security (filters may contain sensitive data).
   */
  captureFilters?: boolean;

  /**
   * Maximum length for captured filter text. Filters longer than this
   * will be truncated. Defaults to 500 characters.
   */
  maxFilterLength?: number;

  /**
   * Whether to capture execution statistics from command monitoring.
   *
   * IMPORTANT: Requires MongoClient to be created with monitorCommands: true
   * Example: new MongoClient(uri, { monitorCommands: true })
   *
   * This captures execution time (mongodb.execution_time_ms) for all queries.
   *
   * Only works when instrumenting the MongoClient. Defaults to false.
   */
  captureExecutionStats?: boolean;

  /**
   * Remote hostname or IP address of the MongoDB server.
   * Example: "mongodb.example.com" or "192.168.1.100"
   */
  peerName?: string;

  /**
   * Remote port number of the MongoDB server.
   * Example: 27017
   */
  peerPort?: number;
}

interface InstrumentedCollection {
  [INSTRUMENTED_FLAG]?: true;
}

interface InstrumentedDb {
  [INSTRUMENTED_FLAG]?: true;
}

interface InstrumentedClient {
  [INSTRUMENTED_FLAG]?: true;
  [COMMAND_SPAN_MAP]?: Map<number, Span>;
}

/**
 * Sanitizes and truncates filter text for safe inclusion in spans.
 */
function sanitizeFilter(filter: unknown, maxLength: number): string {
  try {
    const filterText = JSON.stringify(filter);
    if (filterText.length <= maxLength) {
      return filterText;
    }
    return `${filterText.substring(0, maxLength)}...`;
  } catch {
    return "[Unable to serialize filter]";
  }
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
 * Creates common span attributes for MongoDB operations.
 */
function createBaseAttributes(
  collectionName: string,
  operation: string,
  config?: InstrumentMongoDBConfig
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {
    [SEMATTRS_DB_SYSTEM]: "mongodb",
    [SEMATTRS_DB_OPERATION]: operation,
    [SEMATTRS_DB_MONGODB_COLLECTION]: collectionName,
  };

  if (config?.dbName) {
    attributes[SEMATTRS_DB_NAME] = config.dbName;
  }

  if (config?.peerName) {
    attributes[SEMATTRS_NET_PEER_NAME] = config.peerName;
  }

  if (config?.peerPort) {
    attributes[SEMATTRS_NET_PEER_PORT] = config.peerPort;
  }

  return attributes;
}

/**
 * Adds filter to span attributes if enabled.
 */
function addFilterAttribute(
  span: Span,
  filter: unknown,
  config?: InstrumentMongoDBConfig
): void {
  if (config?.captureFilters && filter) {
    const maxLength = config.maxFilterLength ?? 500;
    const sanitized = sanitizeFilter(filter, maxLength);
    span.setAttribute(SEMATTRS_MONGODB_FILTER, sanitized);
    span.setAttribute(SEMATTRS_DB_STATEMENT, `filter: ${sanitized}`);
  }
}

/**
 * Instruments a MongoDB Collection with OpenTelemetry tracing.
 *
 * This function wraps all major Collection methods to create spans for each database
 * operation. The instrumentation is idempotent - calling it multiple times on the same
 * collection will only instrument it once.
 *
 * @typeParam TSchema - The schema of documents in the collection
 * @param collection - The MongoDB collection to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented collection (same instance, modified in place)
 *
 * @example
 * ```typescript
 * import { MongoClient } from 'mongodb';
 * import { instrumentCollection } from '@kubiks/otel-mongodb';
 *
 * const client = new MongoClient('mongodb://localhost:27017');
 * await client.connect();
 * const db = client.db('myapp');
 * const users = db.collection('users');
 *
 * instrumentCollection(users, {
 *   dbName: 'myapp',
 *   captureFilters: true,
 *   peerName: 'localhost',
 *   peerPort: 27017,
 * });
 *
 * // All operations are now traced
 * await users.findOne({ email: 'user@example.com' });
 * ```
 */
export function instrumentCollection<TSchema extends Document = Document>(
  collection: Collection<TSchema>,
  config?: InstrumentMongoDBConfig
): Collection<TSchema> {
  if (!collection) {
    return collection;
  }

  // Check if already instrumented
  if ((collection as unknown as InstrumentedCollection)[INSTRUMENTED_FLAG]) {
    return collection;
  }

  const {
    tracerName = DEFAULT_TRACER_NAME,
    captureFilters = false,
    maxFilterLength = 500,
  } = config ?? {};

  const tracer = trace.getTracer(tracerName);
  const collectionName = collection.collectionName;

  // Instrument find - wrap toArray as a separate operation
  const originalFind = collection.find.bind(collection);
  collection.find = function instrumentedFind(
    filter?: Filter<TSchema>,
    options?: FindOptions
  ): FindCursor<WithId<TSchema>> {
    const cursor = originalFind(filter ?? {}, options);

    // Wrap toArray to create span when results are actually fetched
    const originalToArray = cursor.toArray.bind(cursor);
    cursor.toArray = async function instrumentedToArray() {
      const span = tracer.startSpan(`mongodb.${collectionName}.find`, {
        kind: SpanKind.CLIENT,
      });

      const attributes = createBaseAttributes(collectionName, "find", config);
      span.setAttributes(attributes);
      addFilterAttribute(span, filter, config);

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const results = await context.with(activeContext, () =>
          originalToArray()
        );
        span.setAttribute(SEMATTRS_MONGODB_RESULT_COUNT, results.length);
        finalizeSpan(span);
        return results;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };

    return cursor;
  };

  // Instrument findOne
  const originalFindOne = collection.findOne.bind(collection);
  collection.findOne = async function instrumentedFindOne(
    filter?: Filter<TSchema>,
    options?: FindOptions
  ): Promise<WithId<TSchema> | null> {
    const span = tracer.startSpan(`mongodb.${collectionName}.findOne`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(collectionName, "findOne", config);
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = (await context.with(activeContext, () =>
        originalFindOne(filter ?? {}, options)
      )) as WithId<TSchema> | null;

      span.setAttribute(SEMATTRS_MONGODB_RESULT_COUNT, result ? 1 : 0);
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument insertOne
  const originalInsertOne = collection.insertOne.bind(collection);
  collection.insertOne = async function instrumentedInsertOne(
    doc: OptionalUnlessRequiredId<TSchema>,
    options?: any
  ): Promise<InsertOneResult<TSchema>> {
    const span = tracer.startSpan(`mongodb.${collectionName}.insertOne`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(
      collectionName,
      "insertOne",
      config
    );
    span.setAttributes(attributes);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalInsertOne(doc, options)
      );

      span.setAttribute(
        SEMATTRS_MONGODB_INSERTED_COUNT,
        result.acknowledged ? 1 : 0
      );
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument insertMany
  const originalInsertMany = collection.insertMany.bind(collection);
  collection.insertMany = async function instrumentedInsertMany(
    docs: OptionalUnlessRequiredId<TSchema>[],
    options?: any
  ): Promise<InsertManyResult<TSchema>> {
    const span = tracer.startSpan(`mongodb.${collectionName}.insertMany`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(
      collectionName,
      "insertMany",
      config
    );
    span.setAttributes(attributes);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalInsertMany(docs, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_INSERTED_COUNT, result.insertedCount);
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument updateOne
  const originalUpdateOne = collection.updateOne.bind(collection);
  collection.updateOne = async function instrumentedUpdateOne(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options?: any
  ): Promise<UpdateResult<TSchema>> {
    const span = tracer.startSpan(`mongodb.${collectionName}.updateOne`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(
      collectionName,
      "updateOne",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalUpdateOne(filter, update, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_MATCHED_COUNT, result.matchedCount);
      span.setAttribute(SEMATTRS_MONGODB_MODIFIED_COUNT, result.modifiedCount);
      if (result.upsertedCount !== undefined) {
        span.setAttribute(
          SEMATTRS_MONGODB_UPSERTED_COUNT,
          result.upsertedCount
        );
      }
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument updateMany
  const originalUpdateMany = collection.updateMany.bind(collection);
  collection.updateMany = async function instrumentedUpdateMany(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options?: any
  ): Promise<UpdateResult<TSchema>> {
    const span = tracer.startSpan(`mongodb.${collectionName}.updateMany`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(
      collectionName,
      "updateMany",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalUpdateMany(filter, update, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_MATCHED_COUNT, result.matchedCount);
      span.setAttribute(SEMATTRS_MONGODB_MODIFIED_COUNT, result.modifiedCount);
      if (result.upsertedCount !== undefined) {
        span.setAttribute(
          SEMATTRS_MONGODB_UPSERTED_COUNT,
          result.upsertedCount
        );
      }
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument deleteOne
  const originalDeleteOne = collection.deleteOne.bind(collection);
  collection.deleteOne = async function instrumentedDeleteOne(
    filter: Filter<TSchema>,
    options?: any
  ): Promise<DeleteResult> {
    const span = tracer.startSpan(`mongodb.${collectionName}.deleteOne`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(
      collectionName,
      "deleteOne",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalDeleteOne(filter, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_DELETED_COUNT, result.deletedCount);
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument deleteMany
  const originalDeleteMany = collection.deleteMany.bind(collection);
  collection.deleteMany = async function instrumentedDeleteMany(
    filter: Filter<TSchema>,
    options?: any
  ): Promise<DeleteResult> {
    const span = tracer.startSpan(`mongodb.${collectionName}.deleteMany`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(
      collectionName,
      "deleteMany",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalDeleteMany(filter, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_DELETED_COUNT, result.deletedCount);
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument countDocuments
  const originalCountDocuments = collection.countDocuments.bind(collection);
  collection.countDocuments = async function instrumentedCountDocuments(
    filter?: Filter<TSchema>,
    options?: CountDocumentsOptions
  ): Promise<number> {
    const span = tracer.startSpan(`mongodb.${collectionName}.countDocuments`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(
      collectionName,
      "countDocuments",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const count = await context.with(activeContext, () =>
        originalCountDocuments(filter, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_RESULT_COUNT, count);
      finalizeSpan(span);
      return count;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument aggregate - wrap toArray as a separate operation
  const originalAggregate = collection.aggregate.bind(collection) as <
    T extends Document = Document,
  >(
    pipeline?: Document[],
    options?: any
  ) => AggregationCursor<T>;

  collection.aggregate = function instrumentedAggregate<
    T extends Document = Document,
  >(pipeline?: Document[], options?: any): AggregationCursor<T> {
    const cursor = originalAggregate<T>(pipeline, options);

    // Wrap toArray to create span when results are actually fetched
    const originalToArray = cursor.toArray.bind(cursor);
    cursor.toArray = async function instrumentedToArray() {
      const span = tracer.startSpan(`mongodb.${collectionName}.aggregate`, {
        kind: SpanKind.CLIENT,
      });

      const attributes = createBaseAttributes(
        collectionName,
        "aggregate",
        config
      );
      span.setAttributes(attributes);

      if (captureFilters && pipeline) {
        const maxLength = maxFilterLength ?? 500;
        const sanitized = sanitizeFilter(pipeline, maxLength);
        span.setAttribute("mongodb.pipeline", sanitized);
        span.setAttribute(SEMATTRS_DB_STATEMENT, `pipeline: ${sanitized}`);
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const results = await context.with(activeContext, () =>
          originalToArray()
        );
        span.setAttribute(SEMATTRS_MONGODB_RESULT_COUNT, results.length);
        finalizeSpan(span);
        return results;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };

    return cursor;
  };

  // Instrument replaceOne
  const originalReplaceOne = collection.replaceOne.bind(collection);
  collection.replaceOne = async function instrumentedReplaceOne(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    options?: any
  ): Promise<UpdateResult<TSchema>> {
    const span = tracer.startSpan(`mongodb.${collectionName}.replaceOne`, {
      kind: SpanKind.CLIENT,
    });

    const attributes = createBaseAttributes(
      collectionName,
      "replaceOne",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalReplaceOne(filter, replacement, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_MATCHED_COUNT, result.matchedCount);
      span.setAttribute(SEMATTRS_MONGODB_MODIFIED_COUNT, result.modifiedCount);
      if (result.upsertedCount !== undefined) {
        span.setAttribute(
          SEMATTRS_MONGODB_UPSERTED_COUNT,
          result.upsertedCount
        );
      }
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument findOneAndUpdate
  const originalFindOneAndUpdate = collection.findOneAndUpdate.bind(collection);
  collection.findOneAndUpdate = async function instrumentedFindOneAndUpdate(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options?: any
  ): Promise<any> {
    const span = tracer.startSpan(
      `mongodb.${collectionName}.findOneAndUpdate`,
      {
        kind: SpanKind.CLIENT,
      }
    );

    const attributes = createBaseAttributes(
      collectionName,
      "findOneAndUpdate",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalFindOneAndUpdate(filter, update, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_RESULT_COUNT, result.value ? 1 : 0);
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument findOneAndDelete
  const originalFindOneAndDelete = collection.findOneAndDelete.bind(collection);
  collection.findOneAndDelete = async function instrumentedFindOneAndDelete(
    filter: Filter<TSchema>,
    options?: any
  ): Promise<any> {
    const span = tracer.startSpan(
      `mongodb.${collectionName}.findOneAndDelete`,
      {
        kind: SpanKind.CLIENT,
      }
    );

    const attributes = createBaseAttributes(
      collectionName,
      "findOneAndDelete",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalFindOneAndDelete(filter, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_DELETED_COUNT, result.value ? 1 : 0);
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Instrument findOneAndReplace
  const originalFindOneAndReplace =
    collection.findOneAndReplace.bind(collection);
  collection.findOneAndReplace = async function instrumentedFindOneAndReplace(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    options?: any
  ): Promise<any> {
    const span = tracer.startSpan(
      `mongodb.${collectionName}.findOneAndReplace`,
      {
        kind: SpanKind.CLIENT,
      }
    );

    const attributes = createBaseAttributes(
      collectionName,
      "findOneAndReplace",
      config
    );
    span.setAttributes(attributes);
    addFilterAttribute(span, filter, config);

    const activeContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(activeContext, () =>
        originalFindOneAndReplace(filter, replacement, options)
      );

      span.setAttribute(SEMATTRS_MONGODB_RESULT_COUNT, result.value ? 1 : 0);
      finalizeSpan(span);
      return result;
    } catch (error) {
      finalizeSpan(span, error);
      throw error;
    }
  };

  // Mark as instrumented
  (collection as unknown as InstrumentedCollection)[INSTRUMENTED_FLAG] = true;

  return collection;
}

/**
 * Instruments a MongoDB Database with OpenTelemetry tracing.
 *
 * This function wraps the database's collection method to automatically instrument
 * all collections accessed through this database instance.
 *
 * @param db - The MongoDB database to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented database (same instance, modified in place)
 *
 * @example
 * ```typescript
 * import { MongoClient } from 'mongodb';
 * import { instrumentDb } from '@kubiks/otel-mongodb';
 *
 * const client = new MongoClient('mongodb://localhost:27017');
 * await client.connect();
 * const db = client.db('myapp');
 *
 * instrumentDb(db, {
 *   dbName: 'myapp',
 *   captureFilters: true,
 * });
 *
 * // All collections are automatically instrumented
 * const users = db.collection('users');
 * await users.findOne({ email: 'user@example.com' });
 * ```
 */
export function instrumentDb(db: Db, config?: InstrumentMongoDBConfig): Db {
  if (!db) {
    return db;
  }

  // Check if already instrumented
  if ((db as unknown as InstrumentedDb)[INSTRUMENTED_FLAG]) {
    return db;
  }

  // Auto-populate dbName from database if not provided
  const finalConfig: InstrumentMongoDBConfig = {
    ...config,
    dbName: config?.dbName ?? db.databaseName,
  };

  // Wrap collection method to instrument all collections
  const originalCollection = db.collection.bind(db) as <
    TSchema extends Document = Document,
  >(
    name: string,
    options?: any
  ) => Collection<TSchema>;

  db.collection = function instrumentedCollection<
    TSchema extends Document = Document,
  >(name: string, options?: any): Collection<TSchema> {
    const collection = originalCollection<TSchema>(name, options);
    return instrumentCollection(collection, finalConfig);
  };

  // Mark as instrumented
  (db as unknown as InstrumentedDb)[INSTRUMENTED_FLAG] = true;

  return db;
}

/**
 * Instruments a MongoDB Client with OpenTelemetry tracing.
 *
 * This function wraps the client's db method to automatically instrument
 * all databases accessed through this client instance.
 *
 * @param client - The MongoDB client to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented client (same instance, modified in place)
 *
 * @example
 * ```typescript
 * import { MongoClient } from 'mongodb';
 * import { instrumentMongoClient } from '@kubiks/otel-mongodb';
 *
 * // To enable execution stats, you MUST create the client with monitorCommands: true
 * const client = new MongoClient('mongodb://localhost:27017', {
 *   monitorCommands: true, // Required for captureExecutionStats
 * });
 * await client.connect();
 *
 * instrumentMongoClient(client, {
 *   captureFilters: true,
 *   captureExecutionStats: true,
 *   peerName: 'localhost',
 *   peerPort: 27017,
 * });
 *
 * // All databases and collections are automatically instrumented
 * const db = client.db('myapp');
 * const users = db.collection('users');
 * await users.findOne({ email: 'user@example.com' });
 * ```
 *
 */
export function instrumentMongoClient(
  client: MongoClient,
  config?: InstrumentMongoDBConfig
): MongoClient {
  if (!client) {
    return client;
  }

  // Check if already instrumented
  const instrumentedClient = client as unknown as InstrumentedClient;
  if (instrumentedClient[INSTRUMENTED_FLAG]) {
    return client;
  }

  // Wrap db method to instrument all databases
  const originalDb = client.db.bind(client);
  client.db = function instrumentedDb(dbName?: string, options?: any): Db {
    const db = originalDb(dbName, options);
    return instrumentDb(db, config);
  };

  // Set up command monitoring for execution stats if enabled
  if (config?.captureExecutionStats) {
    // Create a map to store active spans by request ID
    const spanMap = new Map<number, Span>();
    instrumentedClient[COMMAND_SPAN_MAP] = spanMap;

    // Listen for command started events to capture the active span
    client.on("commandStarted", (event: any) => {
      try {
        // Get the currently active span from OpenTelemetry context
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          spanMap.set(event.requestId, activeSpan);
        }
      } catch (error) {
        // Silently ignore errors to avoid disrupting the application
      }
    });

    // Listen for command succeeded events to capture execution stats
    client.on("commandSucceeded", (event: any) => {
      const span = spanMap.get(event.requestId);
      if (span) {
        try {
          // Add execution time from the event (always available)
          if (event.duration !== undefined) {
            span.setAttribute(
              SEMATTRS_MONGODB_EXECUTION_TIME_MS,
              event.duration
            );
          }

          // Add command-level metadata
          if (event.reply) {
            // Some operations include counts directly in the reply
            if (event.reply.n !== undefined) {
              span.setAttribute("mongodb.reply_count", event.reply.n);
            }
            if (event.reply.nModified !== undefined) {
              span.setAttribute(
                "mongodb.reply_modified",
                event.reply.nModified
              );
            }
          }
        } catch (error) {
          // Silently ignore errors in stats extraction
          // to avoid disrupting the application
        }
      }
      // Clean up the span from the map
      spanMap.delete(event.requestId);
    });

    // Listen for command failed events to clean up
    client.on("commandFailed", (event: any) => {
      spanMap.delete(event.requestId);
    });
  }

  // Mark as instrumented
  instrumentedClient[INSTRUMENTED_FLAG] = true;

  return client;
}
