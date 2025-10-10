import { describe, it, expect, vi, beforeEach } from "vitest";
import { trace, type Tracer, type Span } from "@opentelemetry/api";
import { instrumentAutumn } from "./index";
import type { Autumn } from "autumn-js";

describe("instrumentAutumn", () => {
  let mockClient: Autumn;
  let mockTracer: Tracer;
  let mockSpan: Span;

  beforeEach(() => {
    // Mock span
    mockSpan = {
      setAttributes: vi.fn(),
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
      recordException: vi.fn(),
    } as any;

    // Mock tracer
    mockTracer = {
      startSpan: vi.fn().mockReturnValue(mockSpan),
    } as any;

    // Mock trace.getTracer
    vi.spyOn(trace, "getTracer").mockReturnValue(mockTracer);

    // Mock Autumn client
    mockClient = {
      check: vi.fn().mockResolvedValue({ data: { allowed: true, balance: 5 } }),
      track: vi.fn().mockResolvedValue({ data: { id: "evt_123" } }),
      checkout: vi.fn().mockResolvedValue({ data: { url: "https://checkout.stripe.com" } }),
      attach: vi.fn().mockResolvedValue({ data: { success: true } }),
      cancel: vi.fn().mockResolvedValue({ data: { success: true } }),
    } as any;
  });

  it("should not instrument the same client twice", () => {
    const instrumented1 = instrumentAutumn(mockClient);
    const instrumented2 = instrumentAutumn(instrumented1);
    
    expect(instrumented1).toBe(instrumented2);
  });

  describe("check method", () => {
    it("should create a span for check operations", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.check({
        customer_id: "user_123",
        feature_id: "messages",
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "autumn.check",
        expect.objectContaining({ kind: expect.any(Number) })
      );
    });

    it("should set span attributes for check", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.check({
        customer_id: "user_123",
        feature_id: "messages",
        required_balance: 1,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.customer_id", "user_123");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.feature_id", "messages");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.required_balance", 1);
    });

    it("should handle check errors", async () => {
      mockClient.check = vi.fn().mockRejectedValue(new Error("API Error"));
      const instrumented = instrumentAutumn(mockClient);

      await expect(
        instrumented.check({ customer_id: "user_123", feature_id: "messages" })
      ).rejects.toThrow("API Error");

      expect(mockSpan.recordException).toHaveBeenCalled();
    });
  });

  describe("track method", () => {
    it("should create a span for track operations", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.track({
        customer_id: "user_123",
        feature_id: "messages",
        value: 1,
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "autumn.track",
        expect.objectContaining({ kind: expect.any(Number) })
      );
    });

    it("should set span attributes for track", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.track({
        customer_id: "user_123",
        feature_id: "messages",
        value: 1,
        idempotency_key: "msg_456",
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.customer_id", "user_123");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.feature_id", "messages");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.value", 1);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.idempotency_key", "msg_456");
    });
  });

  describe("checkout method", () => {
    it("should create a span for checkout operations", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.checkout({
        customer_id: "user_123",
        product_id: "pro",
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "autumn.checkout",
        expect.objectContaining({ kind: expect.any(Number) })
      );
    });

    it("should set span attributes for checkout", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.checkout({
        customer_id: "user_123",
        product_id: "pro",
        force_checkout: true,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.customer_id", "user_123");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.product_id", "pro");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.force_checkout", true);
    });

    it("should handle multiple product IDs", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.checkout({
        customer_id: "user_123",
        product_ids: ["pro", "addon_analytics"],
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.product_ids", "pro, addon_analytics");
    });
  });

  describe("attach method", () => {
    it("should create a span for attach operations", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.attach({
        customer_id: "user_123",
        product_id: "free",
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "autumn.attach",
        expect.objectContaining({ kind: expect.any(Number) })
      );
    });
  });

  describe("cancel method", () => {
    it("should create a span for cancel operations", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.cancel({
        customer_id: "user_123",
        product_id: "pro",
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "autumn.cancel",
        expect.objectContaining({ kind: expect.any(Number) })
      );
    });

    it("should set span attributes for cancel", async () => {
      const instrumented = instrumentAutumn(mockClient);
      
      await instrumented.cancel({
        customer_id: "user_123",
        product_id: "pro",
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.customer_id", "user_123");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("autumn.product_id", "pro");
    });
  });
});
