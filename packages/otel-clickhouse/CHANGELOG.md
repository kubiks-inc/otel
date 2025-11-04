# @kubiks/otel-clickhouse

## 1.0.0

### Major Changes

- Initial release of ClickHouse instrumentation for OpenTelemetry
- Automatic query tracing with detailed execution metrics
- Capture read/written rows, bytes, and timing information from ClickHouse response headers
- Support for all query types (SELECT, INSERT, UPDATE, DELETE, etc.)
- Configurable query text capture with length limits
- Network metadata tracking (hostname and port)
- Full OpenTelemetry semantic conventions compliance
- Zero-overhead instrumentation with idempotent design
