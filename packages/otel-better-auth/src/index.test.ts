import { describe, it, expect } from "vitest";
import {
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

  describe("Plugin structure", () => {
    it("should be compatible with Better Auth plugin interface", () => {
      const plugin = otelPlugin();
      
      expect(plugin).toHaveProperty("id");
      expect(plugin).toHaveProperty("onRequest");
      expect(plugin).toHaveProperty("onResponse");
      
      expect(typeof plugin.id).toBe("string");
      expect(typeof plugin.onRequest).toBe("function");
      expect(typeof plugin.onResponse).toBe("function");
    });

    it("should not throw when created with no config", () => {
      expect(() => otelPlugin()).not.toThrow();
    });

    it("should not throw when created with empty config", () => {
      expect(() => otelPlugin({})).not.toThrow();
    });
  });

  describe("Default export", () => {
    it("should export otelPlugin as default", async () => {
      const { default: defaultExport } = await import("./index.js");
      expect(defaultExport).toBe(otelPlugin);
    });
  });
});
