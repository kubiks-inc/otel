import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import type { Sandbox } from "@e2b/code-interpreter";

const DEFAULT_TRACER_NAME = "@kubiks/otel-e2b";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelE2BInstrumented");
const INSTRUMENTED_FILES_FLAG = Symbol("kubiksOtelE2BFilesInstrumented");
const INSTRUMENTED_COMMANDS_FLAG = Symbol("kubiksOtelE2BCommandsInstrumented");

// Semantic attribute constants following OpenTelemetry conventions
export const SEMATTRS_E2B_OPERATION = "e2b.operation" as const;
export const SEMATTRS_E2B_SANDBOX_ID = "e2b.sandbox.id" as const;
export const SEMATTRS_E2B_SANDBOX_TEMPLATE = "e2b.sandbox.template" as const;

// Code execution attributes
export const SEMATTRS_E2B_CODE_LANGUAGE = "e2b.code.language" as const;
export const SEMATTRS_E2B_CODE_HAS_ERROR = "e2b.code.has_error" as const;
export const SEMATTRS_E2B_CODE_EXECUTION_COUNT =
  "e2b.code.execution_count" as const;

// Command execution attributes
export const SEMATTRS_E2B_COMMAND_EXIT_CODE = "e2b.command.exit_code" as const;
export const SEMATTRS_E2B_COMMAND_STDOUT_LINES =
  "e2b.command.stdout_lines" as const;
export const SEMATTRS_E2B_COMMAND_STDERR_LINES =
  "e2b.command.stderr_lines" as const;
export const SEMATTRS_E2B_COMMAND_BACKGROUND =
  "e2b.command.background" as const;

// File operation attributes
export const SEMATTRS_E2B_FILE_OPERATION = "e2b.file.operation" as const;
export const SEMATTRS_E2B_FILE_PATH = "e2b.file.path" as const;
export const SEMATTRS_E2B_FILE_SIZE_BYTES = "e2b.file.size_bytes" as const;
export const SEMATTRS_E2B_FILE_FORMAT = "e2b.file.format" as const;
export const SEMATTRS_E2B_FILE_COUNT = "e2b.file.count" as const;

/**
 * Configuration options for E2B instrumentation.
 */
export interface InstrumentE2BConfig {
  /**
   * Custom tracer name. Defaults to "@kubiks/otel-e2b".
   */
  tracerName?: string;

  /**
   * Whether to capture file paths in spans.
   * Paths only, not content.
   * @default true
   */
  captureFilePaths?: boolean;

  /**
   * Whether to capture file sizes in spans.
   * @default true
   */
  captureFileSize?: boolean;

  /**
   * Whether to capture code language in spans.
   * @default true
   */
  captureCodeLanguage?: boolean;

  /**
   * Whether to capture command output line counts.
   * Only counts, not actual content.
   * @default false
   */
  captureCommandOutput?: boolean;
}

interface InstrumentedSandbox {
  [INSTRUMENTED_FLAG]?: true;
}

interface InstrumentedFilesystem {
  [INSTRUMENTED_FILES_FLAG]?: true;
}

interface InstrumentedCommands {
  [INSTRUMENTED_COMMANDS_FLAG]?: true;
}

/**
 * Finalizes a span with status, timing, and optional error.
 */
function finalizeSpan(span: Span, error?: unknown): void {
  if (error) {
    if (error instanceof Error) {
      span.recordException(error);
    } else {
      span.recordException(new Error(String(error)));
    }
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

/**
 * Instruments the filesystem module of a sandbox.
 */
function instrumentFilesystem(
  files: any,
  sandboxId: string,
  tracer: ReturnType<typeof trace.getTracer>,
  config?: InstrumentE2BConfig
): any {
  if (!files) {
    return files;
  }

  // Check if already instrumented
  if ((files as InstrumentedFilesystem)[INSTRUMENTED_FILES_FLAG]) {
    return files;
  }

  const { captureFilePaths = true, captureFileSize = true } = config ?? {};

  // Instrument read
  const originalRead = files.read?.bind(files);
  if (originalRead) {
    files.read = async function instrumentedRead(
      path: string,
      opts?: any
    ): Promise<any> {
      const span = tracer.startSpan("e2b.files.read", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "files.read",
        [SEMATTRS_E2B_SANDBOX_ID]: sandboxId,
        [SEMATTRS_E2B_FILE_OPERATION]: "read",
      });

      if (captureFilePaths && path) {
        span.setAttribute(SEMATTRS_E2B_FILE_PATH, path);
      }

      if (opts?.format) {
        span.setAttribute(SEMATTRS_E2B_FILE_FORMAT, opts.format);
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalRead(path, opts)
        );

        // Capture size if result is a string or has a length/size property
        if (captureFileSize) {
          if (typeof result === "string") {
            span.setAttribute(SEMATTRS_E2B_FILE_SIZE_BYTES, result.length);
          } else if (result?.length !== undefined) {
            span.setAttribute(SEMATTRS_E2B_FILE_SIZE_BYTES, result.length);
          } else if (result?.size !== undefined) {
            span.setAttribute(SEMATTRS_E2B_FILE_SIZE_BYTES, result.size);
          }
        }

        finalizeSpan(span);
        return result;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Instrument write (handles both single and multiple file writes)
  const originalWrite = files.write?.bind(files);
  if (originalWrite) {
    files.write = async function instrumentedWrite(
      pathOrFiles: string | any[],
      dataOrOpts?: any,
      opts?: any
    ): Promise<any> {
      const span = tracer.startSpan("e2b.files.write", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "files.write",
        [SEMATTRS_E2B_SANDBOX_ID]: sandboxId,
        [SEMATTRS_E2B_FILE_OPERATION]: "write",
      });

      const isArray = Array.isArray(pathOrFiles);

      if (isArray) {
        // Multiple files
        span.setAttribute(SEMATTRS_E2B_FILE_COUNT, pathOrFiles.length);
      } else if (captureFilePaths && typeof pathOrFiles === "string") {
        // Single file
        span.setAttribute(SEMATTRS_E2B_FILE_PATH, pathOrFiles);

        // Try to capture size
        if (captureFileSize && dataOrOpts) {
          if (typeof dataOrOpts === "string") {
            span.setAttribute(SEMATTRS_E2B_FILE_SIZE_BYTES, dataOrOpts.length);
          } else if (dataOrOpts?.length !== undefined) {
            span.setAttribute(SEMATTRS_E2B_FILE_SIZE_BYTES, dataOrOpts.length);
          } else if (dataOrOpts?.size !== undefined) {
            span.setAttribute(SEMATTRS_E2B_FILE_SIZE_BYTES, dataOrOpts.size);
          }
        }
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalWrite(pathOrFiles, dataOrOpts, opts)
        );

        finalizeSpan(span);
        return result;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Instrument list
  const originalList = files.list?.bind(files);
  if (originalList) {
    files.list = async function instrumentedList(
      path: string,
      opts?: any
    ): Promise<any> {
      const span = tracer.startSpan("e2b.files.list", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "files.list",
        [SEMATTRS_E2B_SANDBOX_ID]: sandboxId,
        [SEMATTRS_E2B_FILE_OPERATION]: "list",
      });

      if (captureFilePaths && path) {
        span.setAttribute(SEMATTRS_E2B_FILE_PATH, path);
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalList(path, opts)
        );

        if (Array.isArray(result)) {
          span.setAttribute(SEMATTRS_E2B_FILE_COUNT, result.length);
        }

        finalizeSpan(span);
        return result;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Instrument remove
  const originalRemove = files.remove?.bind(files);
  if (originalRemove) {
    files.remove = async function instrumentedRemove(
      path: string,
      opts?: any
    ): Promise<any> {
      const span = tracer.startSpan("e2b.files.remove", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "files.remove",
        [SEMATTRS_E2B_SANDBOX_ID]: sandboxId,
        [SEMATTRS_E2B_FILE_OPERATION]: "remove",
      });

      if (captureFilePaths && path) {
        span.setAttribute(SEMATTRS_E2B_FILE_PATH, path);
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalRemove(path, opts)
        );

        finalizeSpan(span);
        return result;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Instrument makeDir
  const originalMakeDir = files.makeDir?.bind(files);
  if (originalMakeDir) {
    files.makeDir = async function instrumentedMakeDir(
      path: string,
      opts?: any
    ): Promise<any> {
      const span = tracer.startSpan("e2b.files.makeDir", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "files.makeDir",
        [SEMATTRS_E2B_SANDBOX_ID]: sandboxId,
        [SEMATTRS_E2B_FILE_OPERATION]: "makeDir",
      });

      if (captureFilePaths && path) {
        span.setAttribute(SEMATTRS_E2B_FILE_PATH, path);
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalMakeDir(path, opts)
        );

        finalizeSpan(span);
        return result;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Mark as instrumented
  (files as InstrumentedFilesystem)[INSTRUMENTED_FILES_FLAG] = true;

  return files;
}

/**
 * Instruments the commands module of a sandbox.
 */
function instrumentCommands(
  commands: any,
  sandboxId: string,
  tracer: ReturnType<typeof trace.getTracer>,
  config?: InstrumentE2BConfig
): any {
  if (!commands) {
    return commands;
  }

  // Check if already instrumented
  if ((commands as InstrumentedCommands)[INSTRUMENTED_COMMANDS_FLAG]) {
    return commands;
  }

  const { captureCommandOutput = false } = config ?? {};

  // Instrument run
  const originalRun = commands.run?.bind(commands);
  if (originalRun) {
    commands.run = async function instrumentedRun(
      cmd: string,
      opts?: any
    ): Promise<any> {
      const span = tracer.startSpan("e2b.command.run", {
        kind: SpanKind.CLIENT,
      });

      const isBackground = opts?.background === true;

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "command.run",
        [SEMATTRS_E2B_SANDBOX_ID]: sandboxId,
        [SEMATTRS_E2B_COMMAND_BACKGROUND]: isBackground,
      });

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalRun(cmd, opts)
        );

        // For non-background commands, capture result details
        if (!isBackground && result) {
          if (result.exitCode !== undefined) {
            span.setAttribute(SEMATTRS_E2B_COMMAND_EXIT_CODE, result.exitCode);
          }

          if (captureCommandOutput) {
            if (result.stdout !== undefined) {
              const stdoutLines = Array.isArray(result.stdout)
                ? result.stdout.length
                : typeof result.stdout === "string"
                  ? result.stdout.split("\n").length
                  : 0;
              span.setAttribute(SEMATTRS_E2B_COMMAND_STDOUT_LINES, stdoutLines);
            }

            if (result.stderr !== undefined) {
              const stderrLines = Array.isArray(result.stderr)
                ? result.stderr.length
                : typeof result.stderr === "string"
                  ? result.stderr.split("\n").length
                  : 0;
              span.setAttribute(SEMATTRS_E2B_COMMAND_STDERR_LINES, stderrLines);
            }
          }
        }

        finalizeSpan(span);
        return result;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Mark as instrumented
  (commands as InstrumentedCommands)[INSTRUMENTED_COMMANDS_FLAG] = true;

  return commands;
}

/**
 * Instruments an E2B Sandbox instance with OpenTelemetry tracing.
 *
 * This function wraps sandbox methods to create spans for each operation.
 * The instrumentation is idempotent - calling it multiple times on the same
 * sandbox will only instrument it once.
 *
 * @param sandbox - The E2B Sandbox to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented sandbox (same instance, modified in place)
 *
 * @example
 * ```typescript
 * import { Sandbox } from '@e2b/code-interpreter';
 * import { instrumentSandbox } from '@kubiks/otel-e2b';
 *
 * const sandbox = await Sandbox.create();
 * instrumentSandbox(sandbox, {
 *   captureFilePaths: true,
 *   captureFileSize: true,
 * });
 *
 * // All operations are now traced
 * await sandbox.runCode('print("Hello")');
 * ```
 */
export function instrumentSandbox<T extends Sandbox>(
  sandbox: T,
  config?: InstrumentE2BConfig
): T {
  if (!sandbox) {
    return sandbox;
  }

  // Check if already instrumented
  if ((sandbox as any)[INSTRUMENTED_FLAG]) {
    return sandbox;
  }

  const { tracerName = DEFAULT_TRACER_NAME, captureCodeLanguage = true } =
    config ?? {};

  const tracer = trace.getTracer(tracerName);
  const sandboxId = sandbox.sandboxId || "unknown";

  // Instrument kill method
  const originalKill = sandbox.kill?.bind(sandbox);
  if (originalKill) {
    (sandbox as any).kill = async function instrumentedKill(
      opts?: any
    ): Promise<void> {
      const span = tracer.startSpan("e2b.sandbox.kill", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "sandbox.kill",
        [SEMATTRS_E2B_SANDBOX_ID]: sandboxId,
      });

      const activeContext = trace.setSpan(context.active(), span);

      try {
        await context.with(activeContext, () => originalKill(opts));
        finalizeSpan(span);
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Instrument runCode method (code-interpreter specific)
  const originalRunCode = (sandbox as any).runCode?.bind(sandbox);
  if (originalRunCode) {
    (sandbox as any).runCode = async function instrumentedRunCode(
      code: string,
      opts?: any
    ): Promise<any> {
      const span = tracer.startSpan("e2b.code.run", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "code.run",
        [SEMATTRS_E2B_SANDBOX_ID]: sandboxId,
      });

      // Capture language if available
      if (captureCodeLanguage) {
        const language = opts?.language || opts?.context?.language || "python";
        span.setAttribute(SEMATTRS_E2B_CODE_LANGUAGE, language);
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalRunCode(code, opts)
        );

        // Capture execution details
        if (result) {
          // Always set has_error attribute (true if error exists, false otherwise)
          span.setAttribute(SEMATTRS_E2B_CODE_HAS_ERROR, !!result.error);

          if (result.executionCount !== undefined) {
            span.setAttribute(
              SEMATTRS_E2B_CODE_EXECUTION_COUNT,
              result.executionCount
            );
          }
        }

        finalizeSpan(span);
        return result;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Instrument filesystem module
  if (sandbox.files) {
    instrumentFilesystem(sandbox.files, sandboxId, tracer, config);
  }

  // Instrument commands module
  if (sandbox.commands) {
    instrumentCommands(sandbox.commands, sandboxId, tracer, config);
  }

  // Mark as instrumented
  (sandbox as any)[INSTRUMENTED_FLAG] = true;

  return sandbox;
}

/**
 * Instruments the Sandbox class itself to automatically instrument all created sandboxes.
 *
 * This function wraps the static `Sandbox.create()` method to automatically
 * instrument any sandbox instances it creates.
 *
 * @param SandboxClass - The Sandbox class to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented Sandbox class (same class, modified in place)
 *
 * @example
 * ```typescript
 * import { Sandbox } from '@e2b/code-interpreter';
 * import { instrumentSandboxClass } from '@kubiks/otel-e2b';
 *
 * // Instrument the class once at startup
 * instrumentSandboxClass(Sandbox, {
 *   captureFilePaths: true,
 *   captureFileSize: true,
 * });
 *
 * // All sandboxes created after this are automatically instrumented
 * const sandbox = await Sandbox.create();
 * await sandbox.runCode('print("Hello")'); // Automatically traced
 * ```
 */
export function instrumentSandboxClass<T extends typeof Sandbox>(
  SandboxClass: T,
  config?: InstrumentE2BConfig
): T {
  if (!SandboxClass) {
    return SandboxClass;
  }

  // Check if already instrumented
  if ((SandboxClass as any)[INSTRUMENTED_FLAG]) {
    return SandboxClass;
  }

  const { tracerName = DEFAULT_TRACER_NAME } = config ?? {};
  const tracer = trace.getTracer(tracerName);

  // Instrument the static create method
  const originalCreate = SandboxClass.create?.bind(SandboxClass);
  if (originalCreate) {
    (SandboxClass as any).create = async function instrumentedCreate(
      opts?: any
    ): Promise<Sandbox> {
      const span = tracer.startSpan("e2b.sandbox.create", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_E2B_OPERATION]: "sandbox.create",
      });

      // Capture template if available
      if (opts?.template) {
        span.setAttribute(SEMATTRS_E2B_SANDBOX_TEMPLATE, opts.template);
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const sandbox = await context.with(activeContext, () =>
          originalCreate(opts)
        );

        // Add sandbox ID to span
        if (sandbox?.sandboxId) {
          span.setAttribute(SEMATTRS_E2B_SANDBOX_ID, sandbox.sandboxId);
        }

        finalizeSpan(span);

        // Automatically instrument the created sandbox
        instrumentSandbox(sandbox as Sandbox, config);

        return sandbox as Sandbox;
      } catch (error) {
        finalizeSpan(span, error);
        throw error;
      }
    };
  }

  // Mark as instrumented
  (SandboxClass as any)[INSTRUMENTED_FLAG] = true;

  return SandboxClass;
}
