# @kubiks/otel-upstash-queues

## 1.0.0

### Major Changes

- Initial release of OpenTelemetry instrumentation for Upstash QStash (Queues)
- **Publisher Instrumentation** (`instrumentUpstash`):
  - Instrumentation for `publishJSON` method
  - Support for all QStash request parameters including:
    - URL targeting
    - Delayed and scheduled messages
    - Deduplication
    - Retries configuration
    - Callback URLs
    - Custom HTTP methods
- **Consumer Instrumentation** (`instrumentConsumer`):
  - Instrumentation for message handler functions
  - Extracts QStash headers (message ID, retry count, schedule ID, caller IP)
  - Tracks HTTP response status codes
  - Works seamlessly with `verifySignatureAppRouter` from `@upstash/qstash/nextjs`
- Comprehensive test coverage (19 tests)
- Full TypeScript support with proper types from @upstash/qstash SDK
- No `any` or `unknown` types - fully type-safe