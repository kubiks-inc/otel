# @kubiks/otel-clickhouse

## 1.1.0

### Minor Changes

- [#30](https://github.com/kubiks-inc/otel/pull/30) [`4948896`](https://github.com/kubiks-inc/otel/commit/4948896fb6dccbf0dc716db0353262626aff3156) Thanks [@alex-holovach](https://github.com/alex-holovach)! - Add instrumentation for insert(), exec(), and command() methods. Previously only query() was instrumented, which meant insert operations were not traced despite the README claiming they were. Also update @clickhouse/client peer dependency to require >=0.2.7 to ensure X-ClickHouse-Summary parsing support.

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
