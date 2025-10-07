# @kubiks/otel-upstash

## 1.0.0

### Major Changes

- Initial release of OpenTelemetry instrumentation for Upstash QStash
- Instrumentation for `publishJSON` method
- Support for all QStash request parameters including:
  - URL targeting
  - Delayed and scheduled messages
  - Deduplication
  - Retries configuration
  - Callback URLs
  - Custom HTTP methods
- Comprehensive test coverage
- Full TypeScript support with proper types from @upstash/qstash SDK