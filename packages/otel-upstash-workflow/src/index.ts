import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";

const DEFAULT_TRACER_NAME = "@kubiks/otel-upstash-workflow";
const INSTRUMENTED_FLAG = Symbol("kubiksOtelUpstashWorkflowInstrumented");

// Semantic attribute constants - Base workflow attributes
export const SEMATTRS_WORKFLOW_SYSTEM = "workflow.system" as const;
export const SEMATTRS_WORKFLOW_OPERATION = "workflow.operation" as const;
export const SEMATTRS_WORKFLOW_ID = "workflow.id" as const;
export const SEMATTRS_WORKFLOW_RUN_ID = "workflow.run_id" as const;
export const SEMATTRS_WORKFLOW_URL = "workflow.url" as const;

// Step-level attributes
export const SEMATTRS_WORKFLOW_STEP_NAME = "workflow.step.name" as const;
export const SEMATTRS_WORKFLOW_STEP_TYPE = "workflow.step.type" as const;
export const SEMATTRS_WORKFLOW_STEP_INPUT = "workflow.step.input" as const;
export const SEMATTRS_WORKFLOW_STEP_OUTPUT = "workflow.step.output" as const;
export const SEMATTRS_WORKFLOW_STEP_DURATION =
  "workflow.step.duration_ms" as const;

// Sleep/timing attributes
export const SEMATTRS_WORKFLOW_SLEEP_DURATION =
  "workflow.sleep.duration_ms" as const;
export const SEMATTRS_WORKFLOW_SLEEP_UNTIL =
  "workflow.sleep.until_timestamp" as const;

// Call attributes
export const SEMATTRS_WORKFLOW_CALL_URL = "workflow.call.url" as const;
export const SEMATTRS_WORKFLOW_CALL_METHOD = "workflow.call.method" as const;
export const SEMATTRS_WORKFLOW_CALL_STATUS =
  "workflow.call.status_code" as const;

// Event attributes
export const SEMATTRS_WORKFLOW_EVENT_ID = "workflow.event.id" as const;
export const SEMATTRS_WORKFLOW_EVENT_TIMEOUT =
  "workflow.event.timeout_ms" as const;

// HTTP-level attributes
export const SEMATTRS_HTTP_STATUS_CODE = "http.status_code" as const;

export interface InstrumentationConfig {
  /**
   * Whether to capture step inputs/outputs in spans.
   * @default false
   */
  captureStepData?: boolean;

  /**
   * Maximum length of step input/output to capture. Data longer than this will be truncated.
   * @default 1024
   */
  maxStepDataLength?: number;

  /**
   * Custom tracer name. Defaults to "@kubiks/otel-upstash-workflow".
   */
  tracerName?: string;
}

interface InstrumentedClient {
  [INSTRUMENTED_FLAG]?: true;
}

interface InstrumentedHandler {
  [INSTRUMENTED_FLAG]?: true;
}

/**
 * Serializes and truncates step data for safe inclusion in spans.
 */
function serializeStepData(data: unknown, maxLength: number): string {
  try {
    const serialized = typeof data === "string" ? data : JSON.stringify(data);
    if (serialized.length > maxLength) {
      return serialized.substring(0, maxLength) + "... (truncated)";
    }
    return serialized;
  } catch (error) {
    return "[Unable to serialize step data]";
  }
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
 * Extracts workflow metadata from request headers.
 */
function extractWorkflowHeaders(
  request: Request
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  // Extract workflow ID
  const workflowId = request.headers.get("upstash-workflow-id");
  if (workflowId) {
    attributes[SEMATTRS_WORKFLOW_ID] = workflowId;
  }

  // Extract run ID
  const runId = request.headers.get("upstash-workflow-runid");
  if (runId) {
    attributes[SEMATTRS_WORKFLOW_RUN_ID] = runId;
  }

  // Extract workflow URL
  const workflowUrl = request.headers.get("upstash-workflow-url");
  if (workflowUrl) {
    attributes[SEMATTRS_WORKFLOW_URL] = workflowUrl;
  }

  return attributes;
}

/**
 * Creates a proxy around the workflow context to instrument all context methods.
 */
function createInstrumentedContext<TContext extends Record<string, any>>(
  originalContext: TContext,
  tracer: ReturnType<typeof trace.getTracer>,
  config?: InstrumentationConfig
): TContext {
  const maxLength = config?.maxStepDataLength ?? 1024;
  const captureData = config?.captureStepData ?? false;

  return new Proxy(originalContext, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // Instrument context.run
      if (prop === "run" && typeof original === "function") {
        return function instrumentedRun<T>(
          stepName: string,
          fn: () => Promise<T> | T
        ): Promise<T> {
          const span = tracer.startSpan(`workflow.step.${stepName}`, {
            kind: SpanKind.INTERNAL,
          });

          span.setAttributes({
            [SEMATTRS_WORKFLOW_SYSTEM]: "upstash",
            [SEMATTRS_WORKFLOW_OPERATION]: "step",
            [SEMATTRS_WORKFLOW_STEP_NAME]: stepName,
            [SEMATTRS_WORKFLOW_STEP_TYPE]: "run",
          });

          const activeContext = trace.setSpan(context.active(), span);

          return context.with(activeContext, async () => {
            const startTime = Date.now();
            try {
              const result = await Promise.resolve(fn());

              // Capture output if configured
              if (captureData) {
                const serialized = serializeStepData(result, maxLength);
                span.setAttribute(SEMATTRS_WORKFLOW_STEP_OUTPUT, serialized);
              }

              const duration = Date.now() - startTime;
              span.setAttribute(SEMATTRS_WORKFLOW_STEP_DURATION, duration);

              finalizeSpan(span);
              return result;
            } catch (error) {
              finalizeSpan(span, error);
              throw error;
            }
          });
        };
      }

      // Instrument context.sleep
      if (prop === "sleep" && typeof original === "function") {
        return function instrumentedSleep(
          stepName: string,
          durationSeconds: number | string
        ): Promise<void> {
          const span = tracer.startSpan(`workflow.step.${stepName}`, {
            kind: SpanKind.INTERNAL,
          });

          span.setAttributes({
            [SEMATTRS_WORKFLOW_SYSTEM]: "upstash",
            [SEMATTRS_WORKFLOW_OPERATION]: "step",
            [SEMATTRS_WORKFLOW_STEP_NAME]: stepName,
            [SEMATTRS_WORKFLOW_STEP_TYPE]: "sleep",
          });

          // Convert to milliseconds if numeric
          const durationMs =
            typeof durationSeconds === "number"
              ? durationSeconds * 1000
              : durationSeconds;
          span.setAttribute(SEMATTRS_WORKFLOW_SLEEP_DURATION, durationMs);

          const activeContext = trace.setSpan(context.active(), span);

          return context.with(activeContext, async () => {
            try {
              const result = await (original as any).call(
                target,
                stepName,
                durationSeconds
              );
              finalizeSpan(span);
              return result;
            } catch (error) {
              finalizeSpan(span, error);
              throw error;
            }
          });
        };
      }

      // Instrument context.sleepFor
      if (prop === "sleepFor" && typeof original === "function") {
        return function instrumentedSleepFor(
          durationSeconds: number
        ): Promise<void> {
          const span = tracer.startSpan("workflow.step.sleep", {
            kind: SpanKind.INTERNAL,
          });

          span.setAttributes({
            [SEMATTRS_WORKFLOW_SYSTEM]: "upstash",
            [SEMATTRS_WORKFLOW_OPERATION]: "step",
            [SEMATTRS_WORKFLOW_STEP_TYPE]: "sleep",
          });

          span.setAttribute(
            SEMATTRS_WORKFLOW_SLEEP_DURATION,
            durationSeconds * 1000
          );

          const activeContext = trace.setSpan(context.active(), span);

          return context.with(activeContext, async () => {
            try {
              const result = await (original as any).call(
                target,
                durationSeconds
              );
              finalizeSpan(span);
              return result;
            } catch (error) {
              finalizeSpan(span, error);
              throw error;
            }
          });
        };
      }

      // Instrument context.sleepUntil
      if (prop === "sleepUntil" && typeof original === "function") {
        return function instrumentedSleepUntil(
          timestamp: number | Date
        ): Promise<void> {
          const span = tracer.startSpan("workflow.step.sleepUntil", {
            kind: SpanKind.INTERNAL,
          });

          span.setAttributes({
            [SEMATTRS_WORKFLOW_SYSTEM]: "upstash",
            [SEMATTRS_WORKFLOW_OPERATION]: "step",
            [SEMATTRS_WORKFLOW_STEP_TYPE]: "sleep",
          });

          const timestampValue =
            timestamp instanceof Date ? timestamp.getTime() : timestamp;
          span.setAttribute(SEMATTRS_WORKFLOW_SLEEP_UNTIL, timestampValue);

          const activeContext = trace.setSpan(context.active(), span);

          return context.with(activeContext, async () => {
            try {
              const result = await (original as any).call(target, timestamp);
              finalizeSpan(span);
              return result;
            } catch (error) {
              finalizeSpan(span, error);
              throw error;
            }
          });
        };
      }

      // Instrument context.call
      if (prop === "call" && typeof original === "function") {
        return function instrumentedCall<T>(
          stepName: string,
          url: string,
          options?: any
        ): Promise<T> {
          const span = tracer.startSpan(`workflow.step.${stepName}`, {
            kind: SpanKind.CLIENT,
          });

          span.setAttributes({
            [SEMATTRS_WORKFLOW_SYSTEM]: "upstash",
            [SEMATTRS_WORKFLOW_OPERATION]: "step",
            [SEMATTRS_WORKFLOW_STEP_NAME]: stepName,
            [SEMATTRS_WORKFLOW_STEP_TYPE]: "call",
            [SEMATTRS_WORKFLOW_CALL_URL]: url,
          });

          if (options?.method) {
            span.setAttribute(SEMATTRS_WORKFLOW_CALL_METHOD, options.method);
          }

          // Capture input if configured
          if (captureData && options?.body) {
            const serialized = serializeStepData(options.body, maxLength);
            span.setAttribute(SEMATTRS_WORKFLOW_STEP_INPUT, serialized);
          }

          const activeContext = trace.setSpan(context.active(), span);

          return context.with(activeContext, async () => {
            try {
              const result = await (original as any).call(
                target,
                stepName,
                url,
                options
              );

              // Capture response status if available
              if (result && typeof result === "object" && "status" in result) {
                span.setAttribute(
                  SEMATTRS_WORKFLOW_CALL_STATUS,
                  (result as any).status
                );
              }

              // Capture output if configured
              if (captureData) {
                const serialized = serializeStepData(result, maxLength);
                span.setAttribute(SEMATTRS_WORKFLOW_STEP_OUTPUT, serialized);
              }

              finalizeSpan(span);
              return result;
            } catch (error) {
              finalizeSpan(span, error);
              throw error;
            }
          });
        };
      }

      // Instrument context.waitForEvent
      if (prop === "waitForEvent" && typeof original === "function") {
        return function instrumentedWaitForEvent<T>(
          stepName: string,
          eventId: string,
          timeoutMs?: number
        ): Promise<T> {
          const span = tracer.startSpan(`workflow.step.${stepName}`, {
            kind: SpanKind.INTERNAL,
          });

          span.setAttributes({
            [SEMATTRS_WORKFLOW_SYSTEM]: "upstash",
            [SEMATTRS_WORKFLOW_OPERATION]: "step",
            [SEMATTRS_WORKFLOW_STEP_NAME]: stepName,
            [SEMATTRS_WORKFLOW_STEP_TYPE]: "waitForEvent",
            [SEMATTRS_WORKFLOW_EVENT_ID]: eventId,
          });

          if (timeoutMs) {
            span.setAttribute(SEMATTRS_WORKFLOW_EVENT_TIMEOUT, timeoutMs);
          }

          const activeContext = trace.setSpan(context.active(), span);

          return context.with(activeContext, async () => {
            try {
              const result = await (original as any).call(
                target,
                stepName,
                eventId,
                timeoutMs
              );

              // Capture output if configured
              if (captureData) {
                const serialized = serializeStepData(result, maxLength);
                span.setAttribute(SEMATTRS_WORKFLOW_STEP_OUTPUT, serialized);
              }

              finalizeSpan(span);
              return result;
            } catch (error) {
              finalizeSpan(span, error);
              throw error;
            }
          });
        };
      }

      // Return original value for all other properties
      return original;
    },
  });
}

/**
 * Type for route handlers compatible with Next.js and other frameworks.
 */
type RouteHandler = (request: Request) => Promise<Response> | Response;

/**
 * Type for workflow handler functions that receive a context.
 */
type WorkflowHandler<TContext = any> = (
  context: TContext
) => Promise<any> | any;

/**
 * Type for the serve function from @upstash/workflow.
 */
type ServeFunction = <TContext = any>(
  handler: WorkflowHandler<TContext>
) => RouteHandler;

/**
 * Instruments the serve function to trace workflow execution and all workflow steps.
 *
 * This function wraps the `serve` function from @upstash/workflow to create SERVER spans
 * for the entire workflow execution and INTERNAL spans for each step (context.run, context.sleep, etc.).
 *
 * @param serve - The serve function from @upstash/workflow
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented serve function (same signature)
 *
 * @example
 * ```typescript
 * import { serve as originalServe } from "@upstash/workflow";
 * import { instrumentWorkflowServe } from "@kubiks/otel-upstash-workflow";
 *
 * const serve = instrumentWorkflowServe(originalServe);
 *
 * export const POST = serve(async (context) => {
 *   const result = await context.run("step-1", async () => {
 *     return await processData();
 *   });
 *   return result;
 * });
 * ```
 */
export function instrumentWorkflowServe(
  serve: ServeFunction,
  config?: InstrumentationConfig
): ServeFunction {
  // Check if already instrumented
  if ((serve as any)[INSTRUMENTED_FLAG]) {
    return serve;
  }

  const { tracerName = DEFAULT_TRACER_NAME } = config ?? {};
  const tracer = trace.getTracer(tracerName);

  const instrumentedServe: ServeFunction = function instrumentedServe<
    TContext = any,
  >(handler: WorkflowHandler<TContext>): RouteHandler {
    // Create the route handler using the original serve
    const routeHandler = serve((originalContext: TContext) => {
      // Instrument the context before passing to handler
      const instrumentedContext = createInstrumentedContext(
        originalContext as any,
        tracer,
        config
      );
      // Call user's handler with instrumented context
      return handler(instrumentedContext as TContext);
    });

    // Wrap the route handler to add workflow-level span
    return async function instrumentedRouteHandler(
      request: Request
    ): Promise<Response> {
      const span = tracer.startSpan("workflow.execute", {
        kind: SpanKind.SERVER,
      });

      // Set base attributes
      span.setAttributes({
        [SEMATTRS_WORKFLOW_SYSTEM]: "upstash",
        [SEMATTRS_WORKFLOW_OPERATION]: "execute",
      });

      // Extract and set workflow headers
      const workflowHeaders = extractWorkflowHeaders(request);
      span.setAttributes(workflowHeaders);

      // Set the span as active context
      const activeContext = trace.setSpan(context.active(), span);

      try {
        // Call the route handler within the active context
        const response = await context.with(activeContext, () =>
          routeHandler(request)
        );

        // Capture response status
        span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);

        // Mark as successful if status is 2xx
        if (response.status >= 200 && response.status < 300) {
          finalizeSpan(span);
        } else {
          finalizeSpan(
            span,
            new Error(`Handler returned status ${response.status}`)
          );
        }

        return response;
      } catch (error) {
        // Mark as failed
        finalizeSpan(span, error);
        throw error;
      }
    };
  };

  // Mark as instrumented
  (instrumentedServe as any)[INSTRUMENTED_FLAG] = true;

  return instrumentedServe;
}

/**
 * Instruments the Upstash Workflow Client to trace workflow triggers.
 *
 * This function wraps the Client's trigger method to create CLIENT spans
 * for each workflow trigger operation, capturing workflow metadata.
 *
 * @param client - The Upstash Workflow Client to instrument
 * @param config - Optional configuration for instrumentation behavior
 * @returns The instrumented client (same instance, modified in place)
 *
 * @example
 * ```typescript
 * import { Client } from "@upstash/workflow";
 * import { instrumentWorkflowClient } from "@kubiks/otel-upstash-workflow";
 *
 * const client = instrumentWorkflowClient(
 *   new Client({ token: process.env.QSTASH_TOKEN! })
 * );
 *
 * await client.trigger({
 *   url: "https://your-app.com/api/workflow",
 *   body: { data: "example" },
 * });
 * ```
 */
export function instrumentWorkflowClient<TClient extends Record<string, any>>(
  client: TClient,
  config?: InstrumentationConfig
): TClient {
  // Check if already instrumented
  if ((client as any)[INSTRUMENTED_FLAG]) {
    return client;
  }

  const {
    tracerName = DEFAULT_TRACER_NAME,
    captureStepData = false,
    maxStepDataLength = 1024,
  } = config ?? {};
  const tracer = trace.getTracer(tracerName);

  // Instrument trigger method if it exists
  if (typeof (client as any).trigger === "function") {
    const originalTrigger = (client as any).trigger.bind(client);

    (client as any).trigger = async function instrumentedTrigger(
      options: any
    ): Promise<any> {
      const span = tracer.startSpan("workflow.trigger", {
        kind: SpanKind.CLIENT,
      });

      span.setAttributes({
        [SEMATTRS_WORKFLOW_SYSTEM]: "upstash",
        [SEMATTRS_WORKFLOW_OPERATION]: "trigger",
      });

      // Set URL if available
      if (options?.url) {
        span.setAttribute(SEMATTRS_WORKFLOW_URL, options.url);
      }

      // Capture body if configured
      if (captureStepData && options?.body) {
        const serialized = serializeStepData(options.body, maxStepDataLength);
        span.setAttribute(SEMATTRS_WORKFLOW_STEP_INPUT, serialized);
      }

      const activeContext = trace.setSpan(context.active(), span);

      try {
        const result = await context.with(activeContext, () =>
          originalTrigger(options)
        );

        // Capture workflow ID from response if available
        if (result && typeof result === "object") {
          if ("workflowId" in result && result.workflowId) {
            span.setAttribute(SEMATTRS_WORKFLOW_ID, result.workflowId);
          }
          if ("workflowRunId" in result && result.workflowRunId) {
            span.setAttribute(SEMATTRS_WORKFLOW_RUN_ID, result.workflowRunId);
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
  (client as any)[INSTRUMENTED_FLAG] = true;

  return client;
}
