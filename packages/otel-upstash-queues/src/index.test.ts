import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Client } from "@upstash/qstash";
import {
  instrumentUpstash,
  instrumentConsumer,
  SEMATTRS_MESSAGING_OPERATION,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_QSTASH_CALLBACK_URL,
  SEMATTRS_QSTASH_DEDUPLICATION_ID,
  SEMATTRS_QSTASH_DELAY,
  SEMATTRS_QSTASH_FAILURE_CALLBACK_URL,
  SEMATTRS_QSTASH_MESSAGE_ID,
  SEMATTRS_QSTASH_METHOD,
  SEMATTRS_QSTASH_NOT_BEFORE,
  SEMATTRS_QSTASH_RESOURCE,
  SEMATTRS_QSTASH_RETRIES,
  SEMATTRS_QSTASH_TARGET,
  SEMATTRS_QSTASH_URL,
  SEMATTRS_QSTASH_RETRIED,
  SEMATTRS_QSTASH_SCHEDULE_ID,
  SEMATTRS_QSTASH_CALLER_IP,
  SEMATTRS_HTTP_STATUS_CODE,
} from "./index";

describe("instrumentUpstash", () => {
  let provider: BasicTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
    trace.disable();
  });

  const createMockClient = (): Client => {
    const mockClient = {
      publishJSON: vi.fn(async (request: any) => ({
        messageId: "msg_123",
      })),
    } as unknown as Client;

    return mockClient;
  };

  it("wraps publishJSON and records spans", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/process",
      body: { hello: "world" },
    };

    const response = await client.publishJSON(request);
    expect(response.messageId).toBe("msg_123");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("qstash.messages.publish");
    expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toBe("qstash");
    expect(span.attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("publish");
    expect(span.attributes[SEMATTRS_QSTASH_RESOURCE]).toBe("messages");
    expect(span.attributes[SEMATTRS_QSTASH_TARGET]).toBe("messages.publish");
    expect(span.attributes[SEMATTRS_QSTASH_URL]).toBe("https://example.com/api/process");
    expect(span.attributes[SEMATTRS_QSTASH_METHOD]).toBe("POST");
    expect(span.attributes[SEMATTRS_QSTASH_MESSAGE_ID]).toBe("msg_123");
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("captures request with delay", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/delayed",
      body: { task: "process" },
      delay: 60,
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_DELAY]).toBe(60);
    expect(span.attributes[SEMATTRS_QSTASH_URL]).toBe("https://example.com/api/delayed");
  });

  it("captures request with delay as string", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/delayed",
      body: { task: "process" },
      delay: "1h",
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_DELAY]).toBe("1h");
  });

  it("captures request with notBefore", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const notBefore = Math.floor(Date.now() / 1000) + 3600;
    const request = {
      url: "https://example.com/api/scheduled",
      body: { task: "process" },
      notBefore,
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_NOT_BEFORE]).toBe(notBefore);
  });

  it("captures request with deduplication ID", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/process",
      body: { data: "test" },
      deduplicationId: "unique-id-123",
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_DEDUPLICATION_ID]).toBe("unique-id-123");
  });

  it("captures request with custom method", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/process",
      body: { data: "test" },
      method: "PUT" as const,
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_METHOD]).toBe("PUT");
  });


  it("captures request with retries", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/process",
      body: { data: "test" },
      retries: 3,
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_RETRIES]).toBe(3);
  });

  it("captures request with callback URLs", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/process",
      body: { data: "test" },
      callback: "https://example.com/api/callback",
      failureCallback: "https://example.com/api/failure",
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_CALLBACK_URL]).toBe("https://example.com/api/callback");
    expect(span.attributes[SEMATTRS_QSTASH_FAILURE_CALLBACK_URL]).toBe("https://example.com/api/failure");
  });

  it("captures all request properties together", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/complex",
      body: { data: "complex" },
      method: "POST",
      delay: 120,
      deduplicationId: "complex-id-456",
      contentType: "application/json",
      retries: 5,
      callback: "https://example.com/callback",
      failureCallback: "https://example.com/failure",
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_URL]).toBe("https://example.com/api/complex");
    expect(span.attributes[SEMATTRS_QSTASH_METHOD]).toBe("POST");
    expect(span.attributes[SEMATTRS_QSTASH_DELAY]).toBe(120);
    expect(span.attributes[SEMATTRS_QSTASH_DEDUPLICATION_ID]).toBe("complex-id-456");
    expect(span.attributes[SEMATTRS_QSTASH_RETRIES]).toBe(5);
    expect(span.attributes[SEMATTRS_QSTASH_CALLBACK_URL]).toBe("https://example.com/callback");
    expect(span.attributes[SEMATTRS_QSTASH_FAILURE_CALLBACK_URL]).toBe("https://example.com/failure");
    expect(span.attributes[SEMATTRS_QSTASH_MESSAGE_ID]).toBe("msg_123");
  });

  it("captures errors and marks span status", async () => {
    const client = createMockClient();
    client.publishJSON = vi.fn().mockRejectedValue(new Error("Network error"));

    instrumentUpstash(client);

    await expect(async () =>
      client.publishJSON({
        url: "https://example.com/api/fail",
        body: { test: "error" },
      })
    ).rejects.toThrowError("Network error");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    const hasException = span.events.some((event) => event.name === "exception");
    expect(hasException).toBe(true);
  });

  it("is idempotent", async () => {
    const client = createMockClient();
    const first = instrumentUpstash(client);
    const second = instrumentUpstash(first);

    expect(first).toBe(second);

    await second.publishJSON({
      url: "https://example.com/api/test",
      body: { test: "idempotent" },
    });

    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });

  it("handles minimal request", async () => {
    const client = createMockClient();
    instrumentUpstash(client);

    const request = {
      url: "https://example.com/api/minimal",
      body: { minimal: true },
    };

    await client.publishJSON(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_URL]).toBe("https://example.com/api/minimal");
    expect(span.attributes[SEMATTRS_QSTASH_METHOD]).toBe("POST");
    expect(span.attributes[SEMATTRS_QSTASH_MESSAGE_ID]).toBe("msg_123");
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });
});

describe("instrumentConsumer", () => {
  let provider: BasicTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
    trace.disable();
  });

  const createMockRequest = (headers: Record<string, string> = {}): Request => {
    const mockHeaders = new Headers({
      "content-type": "application/json",
      ...headers,
    });

    return {
      headers: mockHeaders,
      json: vi.fn(async () => ({ data: "test" })),
    } as unknown as Request;
  };

  it("wraps handler and records spans", async () => {
    const handler = vi.fn(async (req: Request) => {
      return Response.json({ success: true });
    });

    const instrumentedHandler = instrumentConsumer(handler);

    const request = createMockRequest({
      "upstash-message-id": "msg_456",
    });

    const response = await instrumentedHandler(request);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("qstash.messages.receive");
    expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toBe("qstash");
    expect(span.attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("receive");
    expect(span.attributes[SEMATTRS_QSTASH_RESOURCE]).toBe("messages");
    expect(span.attributes[SEMATTRS_QSTASH_TARGET]).toBe("messages.receive");
    expect(span.attributes[SEMATTRS_QSTASH_MESSAGE_ID]).toBe("msg_456");
    expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(200);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("captures QStash headers", async () => {
    const handler = vi.fn(async () => Response.json({ success: true }));
    const instrumentedHandler = instrumentConsumer(handler);

    const request = createMockRequest({
      "upstash-message-id": "msg_789",
      "upstash-retried": "2",
      "upstash-schedule-id": "schedule_123",
      "upstash-caller-ip": "192.168.1.1",
    });

    await instrumentedHandler(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_MESSAGE_ID]).toBe("msg_789");
    expect(span.attributes[SEMATTRS_QSTASH_RETRIED]).toBe(2);
    expect(span.attributes[SEMATTRS_QSTASH_SCHEDULE_ID]).toBe("schedule_123");
    expect(span.attributes[SEMATTRS_QSTASH_CALLER_IP]).toBe("192.168.1.1");
  });

  it("handles missing QStash headers gracefully", async () => {
    const handler = vi.fn(async () => Response.json({ success: true }));
    const instrumentedHandler = instrumentConsumer(handler);

    const request = createMockRequest({});

    await instrumentedHandler(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_MESSAGE_ID]).toBeUndefined();
    expect(span.attributes[SEMATTRS_QSTASH_RETRIED]).toBeUndefined();
    expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(200);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("captures errors and marks span status", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("Processing failed"));
    const instrumentedHandler = instrumentConsumer(handler);

    const request = createMockRequest({
      "upstash-message-id": "msg_error",
    });

    await expect(async () => instrumentedHandler(request)).rejects.toThrowError(
      "Processing failed"
    );

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    const hasException = span.events.some((event) => event.name === "exception");
    expect(hasException).toBe(true);
  });

  it("marks span as error for non-2xx status codes", async () => {
    const handler = vi.fn(async () => new Response("Bad Request", { status: 400 }));
    const instrumentedHandler = instrumentConsumer(handler);

    const request = createMockRequest({
      "upstash-message-id": "msg_400",
    });

    const response = await instrumentedHandler(request);
    expect(response.status).toBe(400);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(400);
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("handles retry count as number", async () => {
    const handler = vi.fn(async () => Response.json({ success: true }));
    const instrumentedHandler = instrumentConsumer(handler);

    const request = createMockRequest({
      "upstash-message-id": "msg_retry",
      "upstash-retried": "5",
    });

    await instrumentedHandler(request);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_QSTASH_RETRIED]).toBe(5);
  });

  it("works with verifySignatureAppRouter pattern", async () => {
    // Simulate the pattern: verifySignatureAppRouter(instrumentConsumer(handler))
    const handler = vi.fn(async (req: Request) => {
      const data = await req.json();
      return Response.json({ received: data });
    });

    const instrumentedHandler = instrumentConsumer(handler);
    
    // Simulate what verifySignatureAppRouter might do (simplified)
    const wrappedHandler = async (req: Request) => {
      // Signature verification would happen here
      return instrumentedHandler(req);
    };

    const request = createMockRequest({
      "upstash-message-id": "msg_wrapped",
      "upstash-retried": "0",
    });

    const response = await wrappedHandler(request);
    expect(response.status).toBe(200);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("qstash.messages.receive");
    expect(span.attributes[SEMATTRS_QSTASH_MESSAGE_ID]).toBe("msg_wrapped");
  });
});