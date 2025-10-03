import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  instrumentBetterAuth,
  SEMATTRS_AUTH_OPERATION,
  SEMATTRS_AUTH_METHOD,
  SEMATTRS_AUTH_PROVIDER,
  SEMATTRS_USER_ID,
  SEMATTRS_USER_EMAIL,
  SEMATTRS_SESSION_ID,
  SEMATTRS_AUTH_SUCCESS,
  SEMATTRS_AUTH_ERROR,
} from "./index.js";
import { trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";

describe("otel-better-auth", () => {
  describe("instrumentBetterAuth - Client", () => {
    it("should return the client unchanged if not an object", () => {
      expect(instrumentBetterAuth(null as any)).toBe(null);
      expect(instrumentBetterAuth(undefined as any)).toBe(undefined);
    });

    it("should mark client as instrumented", () => {
      const mockClient = {
        getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      const instrumented = instrumentBetterAuth(mockClient);
      expect(instrumented).toBe(mockClient);
      expect((instrumented as any).__kubiksOtelBetterAuthInstrumented).toBe(
        true,
      );
    });

    it("should not instrument the same client twice", () => {
      const mockClient = {
        getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      const first = instrumentBetterAuth(mockClient);
      const originalGetSession = first.getSession;

      const second = instrumentBetterAuth(first);
      expect(second.getSession).toBe(originalGetSession);
    });

    it("should wrap getSession method", () => {
      const mockGetSession = vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "123" } }, error: null });
      const mockClient = {
        getSession: mockGetSession,
      };

      instrumentBetterAuth(mockClient);

      expect(mockClient.getSession).not.toBe(mockGetSession);
      expect(typeof mockClient.getSession).toBe("function");
    });

    it("should wrap signOut method", () => {
      const mockSignOut = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockClient = {
        signOut: mockSignOut,
      };

      instrumentBetterAuth(mockClient);

      expect(mockClient.signOut).not.toBe(mockSignOut);
      expect(typeof mockClient.signOut).toBe("function");
    });

    it("should wrap signIn.email method", () => {
      const mockSignInEmail = vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "123" } }, error: null });
      const mockClient = {
        signIn: {
          email: mockSignInEmail,
        },
      };

      instrumentBetterAuth(mockClient);

      expect(mockClient.signIn.email).not.toBe(mockSignInEmail);
      expect(typeof mockClient.signIn.email).toBe("function");
    });

    it("should wrap signUp.email method", () => {
      const mockSignUpEmail = vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "123" } }, error: null });
      const mockClient = {
        signUp: {
          email: mockSignUpEmail,
        },
      };

      instrumentBetterAuth(mockClient);

      expect(mockClient.signUp.email).not.toBe(mockSignUpEmail);
      expect(typeof mockClient.signUp.email).toBe("function");
    });

    it("should call original method with correct arguments", async () => {
      const mockGetSession = vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "123" } }, error: null });
      const mockClient = {
        getSession: mockGetSession,
      };

      instrumentBetterAuth(mockClient);
      await mockClient.getSession({ query: "test" });

      expect(mockGetSession).toHaveBeenCalledWith({ query: "test" });
    });

    it("should preserve method context (this binding)", async () => {
      let capturedThis: any;
      const mockClient = {
        value: "test",
        getSession: async function (this: any) {
          capturedThis = this;
          return { data: null, error: null };
        },
      };

      instrumentBetterAuth(mockClient);
      await mockClient.getSession();

      expect(capturedThis).toBe(mockClient);
    });

    it("should handle errors properly", async () => {
      const error = new Error("Auth failed");
      const mockGetSession = vi.fn().mockRejectedValue(error);
      const mockClient = {
        getSession: mockGetSession,
      };

      instrumentBetterAuth(mockClient);

      await expect(mockClient.getSession()).rejects.toThrow("Auth failed");
    });

    it("should accept custom tracer name", () => {
      const mockClient = {
        getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      const instrumented = instrumentBetterAuth(mockClient, {
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
      const mockClient = {
        getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      const instrumented = instrumentBetterAuth(mockClient, {
        tracer: mockTracer as any,
      });

      expect((instrumented as any).__kubiksOtelBetterAuthInstrumented).toBe(
        true,
      );
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

  describe("instrumentBetterAuth - Server", () => {
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
  });

  describe("Default export", () => {
    it("should export instrumentBetterAuth as default", async () => {
      const { default: defaultExport } = await import("./index.js");
      expect(defaultExport).toBe(instrumentBetterAuth);
    });
  });
});
