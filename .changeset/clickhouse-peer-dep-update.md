---
"@kubiks/otel-clickhouse": minor
---

Add instrumentation for insert(), exec(), and command() methods. Previously only query() was instrumented, which meant insert operations were not traced despite the README claiming they were. Also update @clickhouse/client peer dependency to require >=0.2.7 to ensure X-ClickHouse-Summary parsing support.
