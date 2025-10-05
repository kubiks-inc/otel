import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Resend } from "resend";
import {
  instrumentResend,
  SEMATTRS_MESSAGING_OPERATION,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_RESEND_MESSAGE_COUNT,
  SEMATTRS_RESEND_MESSAGE_ID,
  SEMATTRS_RESEND_RECIPIENT_COUNT,
  SEMATTRS_RESEND_RESOURCE,
  SEMATTRS_RESEND_TARGET,
  SEMATTRS_RESEND_TEMPLATE_ID,
  SEMATTRS_RESEND_TO_ADDRESSES,
  SEMATTRS_RESEND_CC_ADDRESSES,
  SEMATTRS_RESEND_BCC_ADDRESSES,
  SEMATTRS_RESEND_FROM,
  SEMATTRS_RESEND_SUBJECT,
} from "./index";

describe("instrumentResend", () => {
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

  const createMockResend = (): Resend => {
    const mockResend = {
      emails: {
        send: vi.fn(async (payload: any) => ({ 
          data: { id: "email_123" }, 
          error: null 
        })),
        create: vi.fn(async (payload: any) => ({ 
          data: { id: "email_123" }, 
          error: null 
        })),
      },
    } as unknown as Resend;

    return mockResend;
  };

  it("wraps emails.send and records spans", async () => {
    const resend = createMockResend();
    instrumentResend(resend);

    const payload = {
      to: ["user@example.com", "second@example.com"],
      from: "sender@example.com",
      subject: "Test Email",
      text: "Hello",
      template_id: "tmpl_123",
    };

    const response = await resend.emails.send(payload);
    expect(response.data?.id).toBe("email_123");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.name).toBe("resend.emails.send");
    expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toBe("resend");
    expect(span.attributes[SEMATTRS_MESSAGING_OPERATION]).toBe("send");
    expect(span.attributes[SEMATTRS_RESEND_RESOURCE]).toBe("emails");
    expect(span.attributes[SEMATTRS_RESEND_TARGET]).toBe("emails.send");
    expect(span.attributes[SEMATTRS_RESEND_MESSAGE_ID]).toBe("email_123");
    expect(span.attributes[SEMATTRS_RESEND_MESSAGE_COUNT]).toBe(1);
    expect(span.attributes[SEMATTRS_RESEND_RECIPIENT_COUNT]).toBe(2);
    expect(span.attributes[SEMATTRS_RESEND_TO_ADDRESSES]).toBe("user@example.com, second@example.com");
    expect(span.attributes[SEMATTRS_RESEND_TEMPLATE_ID]).toBe("tmpl_123");
    expect(span.attributes[SEMATTRS_RESEND_FROM]).toBe("sender@example.com");
    expect(span.attributes[SEMATTRS_RESEND_SUBJECT]).toBe("Test Email");
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("captures errors and marks span status", async () => {
    const resend = createMockResend();
    resend.emails.send = vi.fn().mockRejectedValue(new Error("boom"));
    
    instrumentResend(resend);

    await expect(async () => 
      resend.emails.send({ to: "test@example.com", from: "sender@example.com", subject: "Test", text: "Test" })
    ).rejects.toThrowError("boom");

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
    const resend = createMockResend();
    const first = instrumentResend(resend);
    const second = instrumentResend(first);

    expect(first).toBe(second);

    await second.emails.send({ 
      to: "test@example.com", 
      from: "sender@example.com", 
      subject: "Test", 
      text: "Test" 
    });

    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });

  it("captures email addresses from all recipient fields", async () => {
    const resend = createMockResend();
    instrumentResend(resend);

    const payload = {
      to: ["to1@example.com", "to2@example.com", "to3@example.com"],
      cc: ["cc1@example.com", "cc2@example.com"],
      bcc: "bcc@example.com",
      subject: "Test Email",
      from: "sender@example.com",
      text: "Test content",
    };

    await resend.emails.send(payload);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_RESEND_RECIPIENT_COUNT]).toBe(6);
    expect(span.attributes[SEMATTRS_RESEND_TO_ADDRESSES]).toBe("to1@example.com, to2@example.com, to3@example.com");
    expect(span.attributes[SEMATTRS_RESEND_CC_ADDRESSES]).toBe("cc1@example.com, cc2@example.com");
    expect(span.attributes[SEMATTRS_RESEND_BCC_ADDRESSES]).toBe("bcc@example.com");
    expect(span.attributes[SEMATTRS_RESEND_SUBJECT]).toBe("Test Email");
    expect(span.attributes[SEMATTRS_RESEND_FROM]).toBe("sender@example.com");
  });

  it("handles missing recipient fields gracefully", async () => {
    const resend = createMockResend();
    instrumentResend(resend);

    const payload = {
      to: "single@example.com",
      from: "sender@example.com",
      subject: "Test",
      text: "Test",
    };

    await resend.emails.send(payload);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_RESEND_RECIPIENT_COUNT]).toBe(1);
    expect(span.attributes[SEMATTRS_RESEND_TO_ADDRESSES]).toBe("single@example.com");
    expect(span.attributes[SEMATTRS_RESEND_CC_ADDRESSES]).toBeUndefined();
    expect(span.attributes[SEMATTRS_RESEND_BCC_ADDRESSES]).toBeUndefined();
  });

  it("handles mixed string and array formats correctly", async () => {
    const resend = createMockResend();
    instrumentResend(resend);

    const payload = {
      to: "single@example.com",
      cc: ["cc1@example.com", "cc2@example.com"],
      bcc: ["bcc1@example.com"],
      from: "noreply@example.com",
      subject: "Mixed Format Test",
      text: "Test",
    };

    await resend.emails.send(payload);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    expect(span.attributes[SEMATTRS_RESEND_TO_ADDRESSES]).toBe("single@example.com");
    expect(span.attributes[SEMATTRS_RESEND_CC_ADDRESSES]).toBe("cc1@example.com, cc2@example.com");
    expect(span.attributes[SEMATTRS_RESEND_BCC_ADDRESSES]).toBe("bcc1@example.com");
    expect(span.attributes[SEMATTRS_RESEND_RECIPIENT_COUNT]).toBe(4);
    expect(span.attributes[SEMATTRS_RESEND_FROM]).toBe("noreply@example.com");
    expect(span.attributes[SEMATTRS_RESEND_SUBJECT]).toBe("Mixed Format Test");
  });

  it("also instruments emails.create as an alias", async () => {
    const resend = createMockResend();
    instrumentResend(resend);

    const payload = {
      to: "user@example.com",
      from: "sender@example.com",
      subject: "Test",
      text: "Test",
    };

    // Use create instead of send
    await resend.emails.create(payload);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    if (!span) {
      throw new Error("Expected a span to be recorded");
    }

    // Should still show as emails.send since create is just an alias
    expect(span.name).toBe("resend.emails.send");
    expect(span.attributes[SEMATTRS_RESEND_TARGET]).toBe("emails.send");
  });
});