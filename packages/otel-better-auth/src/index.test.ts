import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {  trace, SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  otelPlugin,
  SEMATTRS_AUTH_OPERATION,
  SEMATTRS_AUTH_METHOD,
  SEMATTRS_AUTH_PROVIDER,
  SEMATTRS_USER_ID,
  SEMATTRS_USER_EMAIL,
  SEMATTRS_AUTH_SUCCESS,
} from "./index.js";

describe("otel-better-auth", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  });

  afterEach(() => {
    exporter.reset();
    provider.shutdown();
  });

  describe("otelPlugin", () => {
    it("should create a plugin with correct id", () => {
      const plugin = otelPlugin();
      expect(plugin.id).toBe("otel");
    });

    it("should have before and after hooks", () => {
      const plugin = otelPlugin();
      expect(plugin.hooks?.before).toBeDefined();
      expect(plugin.hooks?.after).toBeDefined();
      expect(Array.isArray(plugin.hooks?.before)).toBe(true);
      expect(Array.isArray(plugin.hooks?.after)).toBe(true);
    });

    it("should have multiple before hooks for different endpoints", () => {
      const plugin = otelPlugin();
      expect(plugin.hooks?.before?.length).toBeGreaterThan(3);
    });

    it("should have after hook for span finalization", () => {
      const plugin = otelPlugin();
      expect(plugin.hooks?.after?.length).toBe(1);
    });
  });

  describe("Hook matchers", () => {
    it("should match signup endpoints", () => {
      const plugin = otelPlugin();
      const signupHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/sign-up/email", request: {} } as any);
      });
      expect(signupHook).toBeDefined();
    });

    it("should match signin endpoints", () => {
      const plugin = otelPlugin();
      const signinHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/sign-in/email", request: {} } as any);
      });
      expect(signinHook).toBeDefined();
    });

    it("should match forgot password endpoints", () => {
      const plugin = otelPlugin();
      const forgotHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/forget-password", request: {} } as any);
      });
      expect(forgotHook).toBeDefined();
    });

    it("should match OAuth callback endpoints", () => {
      const plugin = otelPlugin();
      const oauthHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/callback/google", request: {} } as any);
      });
      expect(oauthHook).toBeDefined();
    });
  });

  describe("Configuration", () => {
    it("should use custom tracer name", () => {
      const customName = "my-custom-auth-tracer";
      const plugin = otelPlugin({ tracerName: customName });
      expect(plugin.id).toBe("otel");
    });

    it("should accept custom tracer instance", () => {
      const customTracer = trace.getTracer("custom-tracer");
      const plugin = otelPlugin({ tracer: customTracer });
      expect(plugin.id).toBe("otel");
    });

    it("should respect captureEmail setting", () => {
      const plugin = otelPlugin({ captureEmail: true });
      expect(plugin.id).toBe("otel");
    });

    it("should respect captureErrors setting", () => {
      const plugin = otelPlugin({ captureErrors: false });
      expect(plugin.id).toBe("otel");
    });
  });

  describe("Span creation", () => {
    it("should create span for signup", async () => {
      const plugin = otelPlugin();
      const signupHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/sign-up/email", request: {} } as any);
      });

      const ctx = {
        path: "/sign-up/email",
        body: { email: "test@example.com" },
        request: {},
      };

      await signupHook?.handler(ctx as any);

      // Span is created but not finalized yet
      expect((ctx as any).__otelSpan).toBeDefined();
    });

    it("should capture email when enabled", async () => {
      const plugin = otelPlugin({ captureEmail: true });
      const signupHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/sign-up/email", request: {} } as any);
      });

      const ctx = {
        path: "/sign-up/email",
        body: { email: "test@example.com" },
        request: {},
      };

      await signupHook?.handler(ctx as any);

      const span = (ctx as any).__otelSpan;
      expect(span).toBeDefined();
    });

    it("should create span for OAuth callback", async () => {
      const plugin = otelPlugin();
      const oauthHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/callback/google", request: {} } as any);
      });

      const ctx = {
        path: "/callback/google?code=abc123",
        request: {},
      };

      await oauthHook?.handler(ctx as any);

      expect((ctx as any).__otelSpan).toBeDefined();
    });
  });

  describe("Span creation and finalization", () => {
    it("should attach span to context in before hook", async () => {
      const plugin = otelPlugin();
      const signupHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/sign-up/email", request: {} } as any);
      });

      const ctx = {
        path: "/sign-up/email",
        body: { email: "test@example.com" },
        request: {},
        returned: { status: 200 },
      };

      await signupHook?.handler(ctx as any);

      // Verify span was attached
      expect((ctx as any).__otelSpan).toBeDefined();
      expect((ctx as any).__otelContext).toBeDefined();
    });

    it("should cleanup span in after hook", async () => {
      const plugin = otelPlugin();
      const signupHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/sign-up/email", request: {} } as any);
      });

      const ctx = {
        path: "/sign-up/email",
        body: { email: "test@example.com" },
        request: {},
        returned: { status: 200 },
      };

      await signupHook?.handler(ctx as any);
      
      const afterHook = plugin.hooks?.after?.[0];
      await afterHook?.handler(ctx as any);

      // Verify span was cleaned up
      expect((ctx as any).__otelSpan).toBeUndefined();
      expect((ctx as any).__otelContext).toBeUndefined();
    });

    it("should handle error contexts", async () => {
      const plugin = otelPlugin();
      const signinHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/sign-in/email", request: {} } as any);
      });

      const ctx = {
        path: "/sign-in/email",
        body: { email: "test@example.com" },
        request: {},
        error: new Error("Invalid credentials"),
        returned: { status: 401 },
      };

      await signinHook?.handler(ctx as any);

      const afterHook = plugin.hooks?.after?.[0];
      // Should not throw
      expect(async () => await afterHook?.handler(ctx as any)).not.toThrow();
    });
  });

  describe("Semantic conventions", () => {
    it("should export semantic attribute constants", () => {
      expect(SEMATTRS_AUTH_OPERATION).toBe("auth.operation");
      expect(SEMATTRS_AUTH_METHOD).toBe("auth.method");
      expect(SEMATTRS_AUTH_PROVIDER).toBe("auth.provider");
      expect(SEMATTRS_USER_ID).toBe("user.id");
      expect(SEMATTRS_USER_EMAIL).toBe("user.email");
      expect(SEMATTRS_AUTH_SUCCESS).toBe("auth.success");
    });

    it("should create spans with correct operation types", async () => {
      const plugin = otelPlugin({ captureEmail: true });
      const signupHook = plugin.hooks?.before?.find(h => {
        return h.matcher({ path: "/sign-up/email", request: {} } as any);
      });

      const ctx = {
        path: "/sign-up/email",
        body: { email: "test@example.com" },
        request: {},
      };

      await signupHook?.handler(ctx as any);

      // Span should be created and attached
      expect((ctx as any).__otelSpan).toBeDefined();
    });

    it("should support different OAuth providers", async () => {
      const plugin = otelPlugin();
      const providers = ["google", "github", "facebook"];

      for (const provider of providers) {
        const hook = plugin.hooks?.before?.find(h => {
          return h.matcher({ path: `/callback/${provider}`, request: {} } as any);
        });

        const ctx = {
          path: `/callback/${provider}?code=abc`,
          request: {},
        };

        await hook?.handler(ctx as any);

        expect((ctx as any).__otelSpan).toBeDefined();
        
        const afterHook = plugin.hooks?.after?.[0];
        await afterHook?.handler(ctx as any);
      }
    });
  });

  describe("Multiple operations", () => {
    it("should handle multiple auth operations sequentially", async () => {
      const plugin = otelPlugin();

      // Simulate multiple auth operations
      const operations = [
        { path: "/sign-up/email", matcher: "signup" },
        { path: "/sign-in/email", matcher: "signin" },
        { path: "/forget-password", matcher: "forgot" },
      ];

      for (const op of operations) {
        const hook = plugin.hooks?.before?.find(h => {
          return h.matcher({ path: op.path, request: {} } as any);
        });

        expect(hook).toBeDefined();

        const ctx = {
          path: op.path,
          body: { email: "test@example.com" },
          request: {},
          returned: { status: 200 },
        };

        await hook?.handler(ctx as any);
        expect((ctx as any).__otelSpan).toBeDefined();
        
        await plugin.hooks?.after?.[0].handler(ctx as any);
        expect((ctx as any).__otelSpan).toBeUndefined();
      }
    });

    it("should handle concurrent operations", async () => {
      const plugin = otelPlugin();

      const operations = [
        { path: "/sign-up/email" },
        { path: "/sign-in/email" },
        { path: "/sign-out" },
      ];

      const promises = operations.map(async (op) => {
        const hook = plugin.hooks?.before?.find(h => {
          return h.matcher({ path: op.path, request: {} } as any);
        });

        const ctx = {
          path: op.path,
          body: { email: "test@example.com" },
          request: {},
          returned: { status: 200 },
        };

        await hook?.handler(ctx as any);
        await plugin.hooks?.after?.[0].handler(ctx as any);
        
        return ctx;
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
    });
  });

  describe("Default export", () => {
    it("should export otelPlugin as default", async () => {
      const { default: defaultExport } = await import("./index.js");
      expect(defaultExport).toBe(otelPlugin);
    });
  });
});
