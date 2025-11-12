# @kubiks/otel-polar

## 1.0.0

### Major Changes

- Initial release of OpenTelemetry instrumentation for Polar.sh SDK
- Comprehensive instrumentation for all Polar SDK resources and methods
- Support for core resources: benefits, customers, products, subscriptions, checkouts, etc.
- Full customer portal instrumentation for all customer-facing operations
- Webhook validation tracing with event type capture
- Configurable resource ID and organization ID capture
- TypeScript support with full type safety
- Extensive test coverage with vitest
- Detailed span attributes following OpenTelemetry semantic conventions
- Automatic error tracking and exception recording
- Context propagation for distributed tracing
- Idempotent instrumentation (safe to call multiple times)
