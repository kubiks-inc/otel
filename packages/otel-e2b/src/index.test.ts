import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Sandbox } from "@e2b/code-interpreter";
import {
  instrumentSandbox,
  instrumentSandboxClass,
  SEMATTRS_E2B_OPERATION,
  SEMATTRS_E2B_SANDBOX_ID,
  SEMATTRS_E2B_CODE_LANGUAGE,
  SEMATTRS_E2B_CODE_HAS_ERROR,
  SEMATTRS_E2B_CODE_EXECUTION_COUNT,
  SEMATTRS_E2B_COMMAND_EXIT_CODE,
  SEMATTRS_E2B_COMMAND_STDOUT_LINES,
  SEMATTRS_E2B_COMMAND_STDERR_LINES,
  SEMATTRS_E2B_COMMAND_BACKGROUND,
  SEMATTRS_E2B_FILE_OPERATION,
  SEMATTRS_E2B_FILE_PATH,
  SEMATTRS_E2B_FILE_SIZE_BYTES,
  SEMATTRS_E2B_FILE_COUNT,
  SEMATTRS_E2B_FILE_FORMAT,
  SEMATTRS_E2B_SANDBOX_TEMPLATE,
} from "./index";

describe("instrumentSandbox", () => {
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

  const createMockSandbox = (): Sandbox => {
    const mockSandbox = {
      sandboxId: "test-sandbox-123",
      kill: vi.fn(async () => {}),
      runCode: vi.fn(async () => ({
        results: [],
        logs: { stdout: [], stderr: [] },
        error: undefined,
        executionCount: 1,
      })),
      files: {
        read: vi.fn(async () => "file content"),
        write: vi.fn(async () => ({
          path: "/test/file.txt",
          name: "file.txt",
        })),
        list: vi.fn(async () => [
          { name: "file1.txt", type: "file" },
          { name: "file2.txt", type: "file" },
        ]),
        remove: vi.fn(async () => {}),
        makeDir: vi.fn(async () => true),
      },
      commands: {
        run: vi.fn(async () => ({
          exitCode: 0,
          stdout: ["output line 1", "output line 2"],
          stderr: [],
        })),
      },
    } as unknown as Sandbox;

    return mockSandbox;
  };

  it("instruments sandbox.kill() and records spans", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    await sandbox.kill();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.sandbox.kill");
    expect(span?.attributes[SEMATTRS_E2B_OPERATION]).toBe("sandbox.kill");
    expect(span?.attributes[SEMATTRS_E2B_SANDBOX_ID]).toBe("test-sandbox-123");
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.runCode() and captures execution details", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    const result = await (sandbox as any).runCode('print("hello")', {
      language: "python",
    });

    expect(result.executionCount).toBe(1);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.code.run");
    expect(span?.attributes[SEMATTRS_E2B_OPERATION]).toBe("code.run");
    expect(span?.attributes[SEMATTRS_E2B_SANDBOX_ID]).toBe("test-sandbox-123");
    expect(span?.attributes[SEMATTRS_E2B_CODE_LANGUAGE]).toBe("python");
    expect(span?.attributes[SEMATTRS_E2B_CODE_HAS_ERROR]).toBe(false);
    expect(span?.attributes[SEMATTRS_E2B_CODE_EXECUTION_COUNT]).toBe(1);
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.files.read() and captures file details", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    const content = await sandbox.files.read("/path/to/file.txt");

    expect(content).toBe("file content");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.files.read");
    expect(span?.attributes[SEMATTRS_E2B_OPERATION]).toBe("files.read");
    expect(span?.attributes[SEMATTRS_E2B_FILE_OPERATION]).toBe("read");
    expect(span?.attributes[SEMATTRS_E2B_FILE_PATH]).toBe("/path/to/file.txt");
    expect(span?.attributes[SEMATTRS_E2B_FILE_SIZE_BYTES]).toBe(12); // "file content".length
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.files.read() with format option", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    await sandbox.files.read("/path/to/file.txt", { format: "bytes" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.attributes[SEMATTRS_E2B_FILE_FORMAT]).toBe("bytes");
  });

  it("instruments sandbox.files.write() for single file", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    await sandbox.files.write("/path/to/file.txt", "test content");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.files.write");
    expect(span?.attributes[SEMATTRS_E2B_FILE_OPERATION]).toBe("write");
    expect(span?.attributes[SEMATTRS_E2B_FILE_PATH]).toBe("/path/to/file.txt");
    expect(span?.attributes[SEMATTRS_E2B_FILE_SIZE_BYTES]).toBe(12); // "test content".length
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.files.write() for multiple files", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    const files = [
      { path: "/file1.txt", data: "content1" },
      { path: "/file2.txt", data: "content2" },
      { path: "/file3.txt", data: "content3" },
    ];

    await (sandbox.files as any).write(files);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.files.write");
    expect(span?.attributes[SEMATTRS_E2B_FILE_COUNT]).toBe(3);
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.files.list() and captures file count", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    const files = await sandbox.files.list("/path/to/dir");

    expect(files).toHaveLength(2);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.files.list");
    expect(span?.attributes[SEMATTRS_E2B_FILE_OPERATION]).toBe("list");
    expect(span?.attributes[SEMATTRS_E2B_FILE_PATH]).toBe("/path/to/dir");
    expect(span?.attributes[SEMATTRS_E2B_FILE_COUNT]).toBe(2);
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.files.remove()", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    await sandbox.files.remove("/path/to/file.txt");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.files.remove");
    expect(span?.attributes[SEMATTRS_E2B_FILE_OPERATION]).toBe("remove");
    expect(span?.attributes[SEMATTRS_E2B_FILE_PATH]).toBe("/path/to/file.txt");
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.files.makeDir()", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    await sandbox.files.makeDir("/path/to/new/dir");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.files.makeDir");
    expect(span?.attributes[SEMATTRS_E2B_FILE_OPERATION]).toBe("makeDir");
    expect(span?.attributes[SEMATTRS_E2B_FILE_PATH]).toBe("/path/to/new/dir");
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.commands.run() and captures command results", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox, { captureCommandOutput: true });

    const result = await sandbox.commands.run("echo hello");

    expect(result.exitCode).toBe(0);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.command.run");
    expect(span?.attributes[SEMATTRS_E2B_OPERATION]).toBe("command.run");
    expect(span?.attributes[SEMATTRS_E2B_COMMAND_EXIT_CODE]).toBe(0);
    expect(span?.attributes[SEMATTRS_E2B_COMMAND_STDOUT_LINES]).toBe(2);
    expect(span?.attributes[SEMATTRS_E2B_COMMAND_STDERR_LINES]).toBe(0);
    expect(span?.attributes[SEMATTRS_E2B_COMMAND_BACKGROUND]).toBe(false);
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("instruments sandbox.commands.run() in background mode", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox);

    await sandbox.commands.run("long-running-command", { background: true });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.attributes[SEMATTRS_E2B_COMMAND_BACKGROUND]).toBe(true);
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("captures errors and marks span status", async () => {
    const sandbox = createMockSandbox();
    sandbox.kill = vi.fn().mockRejectedValue(new Error("Failed to kill"));

    instrumentSandbox(sandbox);

    await expect(async () => sandbox.kill()).rejects.toThrowError(
      "Failed to kill"
    );

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    const hasException = span?.events.some(
      (event) => event.name === "exception"
    );
    expect(hasException).toBe(true);
  });

  it("is idempotent - calling instrument twice doesn't double-wrap", async () => {
    const sandbox = createMockSandbox();

    const first = instrumentSandbox(sandbox);
    const second = instrumentSandbox(first);

    expect(first).toBe(second);

    await sandbox.kill();

    // Should only create one span, not two
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
  });

  it("respects configuration options - captureFilePaths", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox, { captureFilePaths: false });

    await sandbox.files.read("/secret/path.txt");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.attributes[SEMATTRS_E2B_FILE_PATH]).toBeUndefined();
  });

  it("respects configuration options - captureFileSize", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox, { captureFileSize: false });

    await sandbox.files.read("/path/file.txt");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.attributes[SEMATTRS_E2B_FILE_SIZE_BYTES]).toBeUndefined();
  });

  it("respects configuration options - captureCodeLanguage", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox, { captureCodeLanguage: false });

    await (sandbox as any).runCode('print("test")', { language: "python" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.attributes[SEMATTRS_E2B_CODE_LANGUAGE]).toBeUndefined();
  });

  it("respects configuration options - captureCommandOutput disabled", async () => {
    const sandbox = createMockSandbox();
    instrumentSandbox(sandbox, { captureCommandOutput: false });

    await sandbox.commands.run("echo test");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.attributes[SEMATTRS_E2B_COMMAND_STDOUT_LINES]).toBeUndefined();
    expect(span?.attributes[SEMATTRS_E2B_COMMAND_STDERR_LINES]).toBeUndefined();
  });
});

describe("instrumentSandboxClass", () => {
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

  const createMockSandboxClass = () => {
    const mockSandbox = {
      sandboxId: "created-sandbox-456",
      kill: vi.fn(async () => {}),
      runCode: vi.fn(async () => ({
        results: [],
        logs: { stdout: [], stderr: [] },
      })),
      files: {
        read: vi.fn(async () => "content"),
        write: vi.fn(async () => ({ path: "/test.txt" })),
        list: vi.fn(async () => []),
        remove: vi.fn(async () => {}),
        makeDir: vi.fn(async () => true),
      },
      commands: {
        run: vi.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
      },
    } as unknown as Sandbox;

    return {
      create: vi.fn(async () => mockSandbox),
    } as unknown as typeof Sandbox;
  };

  it("instruments Sandbox.create() and records span", async () => {
    const SandboxClass = createMockSandboxClass();
    instrumentSandboxClass(SandboxClass);

    const sandbox = await SandboxClass.create();

    expect(sandbox.sandboxId).toBe("created-sandbox-456");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.sandbox.create");
    expect(span?.attributes[SEMATTRS_E2B_OPERATION]).toBe("sandbox.create");
    expect(span?.attributes[SEMATTRS_E2B_SANDBOX_ID]).toBe(
      "created-sandbox-456"
    );
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("captures template from options", async () => {
    const SandboxClass = createMockSandboxClass();
    instrumentSandboxClass(SandboxClass);

    await SandboxClass.create({ template: "custom-template" });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.attributes[SEMATTRS_E2B_SANDBOX_TEMPLATE]).toBe(
      "custom-template"
    );
  });

  it("automatically instruments created sandbox instances", async () => {
    const SandboxClass = createMockSandboxClass();
    instrumentSandboxClass(SandboxClass);

    const sandbox = await SandboxClass.create();

    // Clear spans from create operation
    exporter.reset();

    // Use the sandbox - should be automatically instrumented
    await sandbox.kill();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.sandbox.kill");
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  it("is idempotent - calling instrumentSandboxClass twice doesn't double-wrap", async () => {
    const SandboxClass = createMockSandboxClass();

    const first = instrumentSandboxClass(SandboxClass);
    const second = instrumentSandboxClass(first);

    expect(first).toBe(second);

    await SandboxClass.create();

    // Should only create one span for create, not two
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("e2b.sandbox.create");
  });

  it("handles errors during sandbox creation", async () => {
    const SandboxClass = createMockSandboxClass();
    (SandboxClass as any).create = vi
      .fn()
      .mockRejectedValue(new Error("Failed to create sandbox"));

    instrumentSandboxClass(SandboxClass);

    await expect(async () => SandboxClass.create()).rejects.toThrowError(
      "Failed to create sandbox"
    );

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span?.name).toBe("e2b.sandbox.create");
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    const hasException = span?.events.some(
      (event) => event.name === "exception"
    );
    expect(hasException).toBe(true);
  });
});
