# @kubiks/otel-mongodb

## 1.0.0

### Major Changes

- Initial release of OpenTelemetry instrumentation for MongoDB Node.js driver
- **Core Instrumentation**:
  - `instrumentMongoClient`: Instrument entire MongoDB client for automatic tracing
  - `instrumentDb`: Instrument database level with auto-instrumentation of collections
  - `instrumentCollection`: Instrument individual collections with fine-grained control
- **Query Operations**:
  - `find()` - Trace find operations with result count (traced on `.toArray()` call)
  - `findOne()` - Trace single document queries
  - `countDocuments()` - Trace count operations
  - `aggregate()` - Trace aggregation pipelines (traced on `.toArray()` call)
- **Write Operations**:
  - `insertOne()` and `insertMany()` - Trace document insertions
  - `updateOne()` and `updateMany()` - Trace document updates with match/modify counts
  - `replaceOne()` - Trace document replacements
  - `deleteOne()` and `deleteMany()` - Trace document deletions
- **Atomic Operations**:
  - `findOneAndUpdate()` - Trace atomic find and update
  - `findOneAndDelete()` - Trace atomic find and delete
  - `findOneAndReplace()` - Trace atomic find and replace
- **Rich Span Attributes**:
  - Database system, operation type, collection name
  - Result counts (matched, modified, deleted, inserted)
  - Optional query filter capture with configurable size limits
  - Network peer information (hostname, port)
- **Configuration Options**:
  - `captureFilters`: Enable/disable query filter capture (default: false for security)
  - `maxFilterLength`: Limit captured filter size (default: 500 chars)
  - `dbName`: Database name for span attributes
  - `peerName` and `peerPort`: MongoDB server connection info
- **Features**:
  - Idempotent instrumentation (safe to call multiple times)
  - Automatic database name detection
  - Comprehensive error handling and span status
  - Fixed cursor handling to prevent memory leaks
  - Zero-configuration setup with sensible defaults
  - Full TypeScript support with proper types
- Comprehensive test coverage with 40+ tests
- Full OpenTelemetry semantic conventions compliance
- Detailed documentation with Next.js and Express examples

