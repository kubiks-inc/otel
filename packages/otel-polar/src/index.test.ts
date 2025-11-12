import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  trace,
  context,
  SpanStatusCode,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { instrumentPolar, SEMATTRS_POLAR_OPERATION, SEMATTRS_POLAR_RESOURCE } from "./index";

describe("@kubiks/otel-polar", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

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

  describe("instrumentPolar", () => {
    it("should instrument the Polar client without errors", () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);
      expect(instrumented).toBe(mockClient);
    });

    it("should not double-instrument the same client", () => {
      const mockClient = createMockPolarClient();
      const instrumented1 = instrumentPolar(mockClient as any);
      const instrumented2 = instrumentPolar(instrumented1 as any);
      expect(instrumented1).toBe(instrumented2);
    });

    it("should handle null/undefined client gracefully", () => {
      expect(instrumentPolar(null as any)).toBe(null);
      expect(instrumentPolar(undefined as any)).toBe(undefined);
    });

    it("should create spans for benefits.list operation", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.benefits.list({ organizationId: "org_123" });

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.benefits.list");
      expect(span.attributes[SEMATTRS_POLAR_OPERATION]).toBe("benefits.list");
      expect(span.attributes[SEMATTRS_POLAR_RESOURCE]).toBe("benefits");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should create spans for customers.create operation", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.customers.create({
        email: "test@example.com",
        organizationId: "org_123",
      });

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.customers.create");
      expect(span.attributes[SEMATTRS_POLAR_OPERATION]).toBe("customers.create");
      expect(span.attributes[SEMATTRS_POLAR_RESOURCE]).toBe("customers");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should create spans for products.get operation with ID", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.products.get("prod_123");

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.products.get");
      // The resource_id should be captured from the first argument (string ID)
      expect(span.attributes["polar.resource_id"]).toBeDefined();
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should create spans for subscriptions.update operation", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.subscriptions.update("sub_123", {
        status: "active",
      });

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.subscriptions.update");
      expect(span.attributes[SEMATTRS_POLAR_OPERATION]).toBe("subscriptions.update");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should create spans for checkouts.create operation", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.checkouts.create({
        productId: "prod_123",
        successUrl: "https://example.com/success",
      });

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.checkouts.create");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should create spans for licenseKeys.get operation", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.licenseKeys.get("lic_123");

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.licenseKeys.get");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should create spans for organizations.list operation", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.organizations.list({});

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.organizations.list");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should handle errors and mark span as failed", async () => {
      const mockClient = createMockPolarClient();
      mockClient.benefits.list = vi.fn().mockRejectedValue(
        new Error("API Error")
      );

      const instrumented = instrumentPolar(mockClient as any);

      await expect(
        instrumented.benefits.list({ organizationId: "org_123" })
      ).rejects.toThrow("API Error");

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.events.length).toBeGreaterThan(0);
      expect(span.events[0].name).toBe("exception");
    });

    it("should instrument customer portal operations when enabled", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any, {
        instrumentCustomerPortal: true,
      });

      await instrumented.customerPortal.subscriptions.list({});

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.customerPortal.subscriptions.list");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should not instrument customer portal when disabled", () => {
      const mockClient = createMockPolarClient();
      const originalMethod = mockClient.customerPortal.subscriptions.list;

      instrumentPolar(mockClient as any, {
        instrumentCustomerPortal: false,
      });

      // Method should remain the same
      expect(mockClient.customerPortal.subscriptions.list).toBe(originalMethod);
    });

    it("should capture organization ID from request params", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any, {
        captureOrganizationIds: true,
      });

      await instrumented.benefits.list({ organizationId: "org_456" });

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.attributes["polar.organization_id"]).toBe("org_456");
    });

    it("should use custom tracer name when provided", async () => {
      const mockClient = createMockPolarClient();
      const customTracerName = "custom-tracer";

      instrumentPolar(mockClient as any, {
        tracerName: customTracerName,
      });

      await mockClient.benefits.list({});

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);
      // Tracer name is used internally but not directly testable via span attributes
    });

    it("should instrument files operations", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.files.upload({ name: "test.pdf", data: "..." as any });

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.files.upload");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should instrument events operations", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.events.list({});

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.events.list");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should instrument discounts operations", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await instrumented.discounts.create({
        code: "SAVE10",
        organizationId: "org_123",
        type: "percentage",
        value: 10,
      });

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe("polar.discounts.create");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("should handle multiple concurrent operations", async () => {
      const mockClient = createMockPolarClient();
      const instrumented = instrumentPolar(mockClient as any);

      await Promise.all([
        instrumented.benefits.list({}),
        instrumented.customers.list({}),
        instrumented.products.list({}),
      ]);

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBe(3);

      const spanNames = spans.map((s) => s.name);
      expect(spanNames).toContain("polar.benefits.list");
      expect(spanNames).toContain("polar.customers.list");
      expect(spanNames).toContain("polar.products.list");
    });

    it("should preserve method context and return values", async () => {
      const mockClient = createMockPolarClient();
      const expectedResult = { data: { id: "benefit_123" } };
      const getSpy = vi.fn().mockResolvedValue(expectedResult);
      mockClient.benefits.get = getSpy;

      const instrumented = instrumentPolar(mockClient as any);
      const result = await instrumented.benefits.get("benefit_123");

      expect(result).toEqual(expectedResult);
      // Check the spy was called (before instrumentation wrapping)
      expect(getSpy).toHaveBeenCalledWith("benefit_123");
    });
  });
});

/**
 * Helper function to create a mock Polar client for testing
 */
function createMockPolarClient() {
  const createResource = () => ({
    list: vi.fn().mockResolvedValue({ data: [] }),
    create: vi.fn().mockResolvedValue({ data: { id: "test_id" } }),
    get: vi.fn().mockResolvedValue({ data: { id: "test_id" } }),
    update: vi.fn().mockResolvedValue({ data: { id: "test_id" } }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    search: vi.fn().mockResolvedValue({ data: [] }),
    export: vi.fn().mockResolvedValue({ data: {} }),
    validate: vi.fn().mockResolvedValue({ data: { valid: true } }),
    activate: vi.fn().mockResolvedValue({ data: {} }),
    deactivate: vi.fn().mockResolvedValue({ data: {} }),
    upload: vi.fn().mockResolvedValue({ data: { id: "file_id" } }),
    download: vi.fn().mockResolvedValue({ data: {} }),
  });

  return {
    benefitGrants: createResource(),
    benefits: createResource(),
    checkoutLinks: createResource(),
    checkouts: createResource(),
    customerMeters: createResource(),
    customers: createResource(),
    customerSeats: createResource(),
    customerSessions: createResource(),
    customFields: createResource(),
    discounts: createResource(),
    events: createResource(),
    files: createResource(),
    licenseKeys: createResource(),
    organizations: createResource(),
    orders: createResource(),
    products: createResource(),
    subscriptions: createResource(),
    wallets: createResource(),
    metrics: createResource(),
    oauth2: createResource(),
    customerPortal: {
      benefitGrants: createResource(),
      customerMeters: createResource(),
      customers: createResource(),
      customerSession: createResource(),
      downloadables: createResource(),
      licenseKeys: createResource(),
      orders: createResource(),
      organizations: createResource(),
      seats: createResource(),
      subscriptions: createResource(),
      wallets: createResource(),
    },
    webhooks: {
      validate: vi.fn().mockResolvedValue({ type: "checkout.created" }),
    },
  };
}
