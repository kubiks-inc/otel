# @kubiks/otel-drizzle

## 1.0.0

### Major Changes

- Initial release of Drizzle ORM instrumentation package
- Automatic tracing for all Drizzle database queries
- Support for PostgreSQL, MySQL, and SQLite
- Configurable query text capture with sanitization
- Full OpenTelemetry semantic conventions compliance
- Comprehensive test coverage

### Features

- Network peer attributes (`net.peer.name` and `net.peer.port`) for better observability
- Configurable database connection information in spans
- Proper span status codes (OK/ERROR) following OpenTelemetry standards
- Exception recording with full stack traces
