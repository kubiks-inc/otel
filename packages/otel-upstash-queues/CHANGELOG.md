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
  - Optional configuration support:
    - `captureBody`: Enable/disable request body capture (default: false)
    - `maxBodyLength`: Limit captured body size (default: 1024)
- **Consumer Instrumentation** (`instrumentConsumer`):
  - Instrumentation for message handler functions
  - Extracts QStash headers (message ID, retry count, schedule ID, caller IP)
  - Tracks HTTP response status codes
  - Works seamlessly with `verifySignatureAppRouter` from `@upstash/qstash/nextjs`
  - Optional configuration support:
    - `captureBody`: Enable/disable request and response body capture (default: false)
    - `maxBodyLength`: Limit captured body size (default: 1024)
- **Body Capture Features**:
  - Safe serialization with error handling
  - Automatic truncation of large bodies
  - Disabled by default for security
  - Captured as `qstash.request.body` and `qstash.response.body` attributes
- Comprehensive test coverage (27 tests)
- Full TypeScript support with proper types from @upstash/qstash SDK
- No `any` or `unknown` types - fully type-safe
- Exported `InstrumentationConfig` type for TypeScript users