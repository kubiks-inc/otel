import { describe, it, expect, vi } from "vitest";
import {
  instrumentBetterAuth,
  otelPlugin,
  SEMATTRS_AUTH_OPERATION,
  SEMATTRS_AUTH_METHOD,
  SEMATTRS_AUTH_PROVIDER,
  SEMATTRS_USER_ID,
  SEMATTRS_USER_EMAIL,
  SEMATTRS_SESSION_ID,
  SEMATTRS_AUTH_SUCCESS,
  SEMATTRS_AUTH_ERROR,
} from "./index.js";

describe("otel-better-auth", () => {
  describe("instrumentBetterAuth", () => {
    it("should return unchanged if not an object", () => {
      expect(instrumentBetterAuth(null as any)).toBe(null);
      expect(instrumentBetterAuth(undefined as any)).toBe(undefined);
    });

    it("should instrument server instance with api methods", () => {
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          getSession: vi
            .fn()
            .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } }),
          signInEmail: vi
            .fn()
            .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } }),
          signUpEmail: vi
            .fn()
            .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } }),
          signOut: vi.fn().mockResolvedValue({}),
        },
        options: {},
      };

      const instrumented = instrumentBetterAuth(mockServer as any);
      expect(instrumented).toBe(mockServer);
      expect((instrumented as any).__kubiksOtelBetterAuthInstrumented).toBe(
        true,
      );
    });

    it("should wrap api.getSession method", () => {
      const mockGetSession = vi
        .fn()
        .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } });
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          getSession: mockGetSession,
        },
        options: {},
      };

      instrumentBetterAuth(mockServer as any);

      expect(mockServer.api.getSession).not.toBe(mockGetSession);
      expect(typeof mockServer.api.getSession).toBe("function");
    });

    it("should wrap api.signInEmail method", () => {
      const mockSignInEmail = vi
        .fn()
        .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } });
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          signInEmail: mockSignInEmail,
        },
        options: {},
      };

      instrumentBetterAuth(mockServer as any);

      expect(mockServer.api.signInEmail).not.toBe(mockSignInEmail);
      expect(typeof mockServer.api.signInEmail).toBe("function");
    });

    it("should call original server api method with correct arguments", async () => {
      const mockGetSession = vi
        .fn()
        .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } });
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          getSession: mockGetSession,
        },
        options: {},
      };

      instrumentBetterAuth(mockServer as any);
      await mockServer.api.getSession({ query: { test: "value" } });

      expect(mockGetSession).toHaveBeenCalledWith({ query: { test: "value" } });
    });

    it("should not instrument the same server instance twice", () => {
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          getSession: vi
            .fn()
            .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } }),
        },
        options: {},
      };

      const first = instrumentBetterAuth(mockServer as any);
      const originalGetSession = first.api.getSession;

      const second = instrumentBetterAuth(first as any);
      expect(second.api.getSession).toBe(originalGetSession);
    });

    it("should inject otel plugin when not already present", () => {
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          getSession: vi
            .fn()
            .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } }),
        },
        options: {},
      };

      instrumentBetterAuth(mockServer as any);

      const plugins = (mockServer as any).options?.plugins as
        | ReturnType<typeof otelPlugin>[]
        | undefined;
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins?.some((plugin) => plugin.id === "otel")).toBe(true);
    });

    it("should not duplicate otel plugin if already provided", () => {
      const existingPlugin = otelPlugin();
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          getSession: vi
            .fn()
            .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } }),
        },
        options: {
          plugins: [existingPlugin],
        },
      };

      instrumentBetterAuth(mockServer as any);

      const plugins = ((mockServer as any).options?.plugins ?? []) as ReturnType<
        typeof otelPlugin
      >[];
      const otelPlugins = plugins.filter((plugin) => plugin.id === "otel");
      expect(otelPlugins).toHaveLength(1);
      expect(otelPlugins[0]).toBe(existingPlugin);
    });

    it("should accept custom tracer name", () => {
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          getSession: vi
            .fn()
            .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } }),
        },
        options: {},
      };

      const instrumented = instrumentBetterAuth(mockServer as any, {
        tracerName: "custom-tracer",
      });

      expect((instrumented as any).__kubiksOtelBetterAuthInstrumented).toBe(
        true,
      );
    });

    it("should accept custom tracer instance", () => {
      const mockTracer = {
        startSpan: vi.fn(),
      };
      const mockServer = {
        handler: vi.fn().mockResolvedValue(new Response()),
        api: {
          getSession: vi
            .fn()
            .mockResolvedValue({ user: { id: "123" }, session: { id: "456" } }),
        },
        options: {},
      };

      const instrumented = instrumentBetterAuth(mockServer as any, {
        tracer: mockTracer as any,
      });

      expect((instrumented as any).__kubiksOtelBetterAuthInstrumented).toBe(
        true,
      );
    });
  });

  describe("otelPlugin", () => {
    it("should create a plugin with correct id", () => {
      const plugin = otelPlugin();
      expect(plugin.id).toBe("otel");
    });

    it("should have onRequest handler", () => {
      const plugin = otelPlugin();
      expect(plugin.onRequest).toBeDefined();
      expect(typeof plugin.onRequest).toBe("function");
    });

    it("should have onResponse handler", () => {
      const plugin = otelPlugin();
      expect(plugin.onResponse).toBeDefined();
      expect(typeof plugin.onResponse).toBe("function");
    });

    it("should accept custom tracer name", () => {
      const plugin = otelPlugin({ tracerName: "custom-tracer" });
      expect(plugin.id).toBe("otel");
    });

    it("should accept custom tracer instance", () => {
      const plugin = otelPlugin({ tracer: {} as any });
      expect(plugin.id).toBe("otel");
    });
  });

  describe("Semantic conventions", () => {
    it("should export correct attribute constants", () => {
      expect(SEMATTRS_AUTH_OPERATION).toBe("auth.operation");
      expect(SEMATTRS_AUTH_METHOD).toBe("auth.method");
      expect(SEMATTRS_AUTH_PROVIDER).toBe("auth.provider");
      expect(SEMATTRS_USER_ID).toBe("user.id");
      expect(SEMATTRS_USER_EMAIL).toBe("user.email");
      expect(SEMATTRS_SESSION_ID).toBe("session.id");
      expect(SEMATTRS_AUTH_SUCCESS).toBe("auth.success");
      expect(SEMATTRS_AUTH_ERROR).toBe("auth.error");
    });
  });

  describe("Default export", () => {
    it("should export instrumentBetterAuth as default", async () => {
      const { default: defaultExport } = await import("./index.js");
      expect(defaultExport).toBe(instrumentBetterAuth);
    });
  });
});
