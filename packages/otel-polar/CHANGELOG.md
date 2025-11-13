# @kubiks/otel-polar

## 1.0.1

### Patch Changes

- [`b57d2c6`](https://github.com/kubiks-inc/otel/commit/b57d2c6a467255428e80005d4cedeb1135d3cf71) Thanks [@alex-holovach](https://github.com/alex-holovach)! - update image

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
