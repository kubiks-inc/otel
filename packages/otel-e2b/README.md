# @kubiks/otel-e2b

OpenTelemetry instrumentation for [E2B Sandboxes](https://e2b.dev).
Capture spans for sandbox lifecycle, code execution, file operations, and command execution to monitor and debug your E2B sandbox operations.

![E2B Trace Visualization](https://github.com/kubiks-inc/otel/blob/main/images/otel-e2b-trace.png)

## Installation

```bash
npm install @kubiks/otel-e2b
# or
pnpm add @kubiks/otel-e2b
```

## Quick Start

```ts
import { Sandbox } from "@e2b/code-interpreter";
import { instrumentSandbox } from "@kubiks/otel-e2b";

const sandbox = await Sandbox.create();
instrumentSandbox(sandbox);

// All operations are now traced
await sandbox.runCode('print("Hello from E2B")');
await sandbox.files.write("/app/data.txt", "some data");
await sandbox.commands.run("ls -la");
await sandbox.kill();
```

`instrumentSandbox` wraps the sandbox you already use — no configuration changes needed. Every operation creates a client span with useful attributes.

You can also use `instrumentSandboxClass(Sandbox)` to automatically instrument all sandboxes created after setup.

## What Gets Traced

This instrumentation automatically traces all E2B sandbox operations including `Sandbox.create()`, `sandbox.kill()`, `sandbox.runCode()` (code execution), `sandbox.commands.run()` (shell commands), and all file operations (`files.read()`, `files.write()`, `files.list()`, `files.remove()`, `files.makeDir()`).

## Span Attributes

Each span includes relevant attributes for debugging and monitoring:

| Attribute                  | Description                           | Example                      |
| -------------------------- | ------------------------------------- | ---------------------------- |
| `e2b.operation`            | Operation type                        | `sandbox.create`, `code.run` |
| `e2b.sandbox.id`           | Unique sandbox identifier             | `sb_abc123def456`            |
| `e2b.sandbox.template`     | Template used for creation            | `custom-template`            |
| `e2b.code.language`        | Programming language                  | `python`, `javascript`       |
| `e2b.code.has_error`       | Whether execution had errors          | `true`, `false`              |
| `e2b.code.execution_count` | Execution count from result           | `1`, `2`, `3`                |
| `e2b.command.exit_code`    | Process exit code                     | `0`, `1`, `127`              |
| `e2b.command.stdout_lines` | Number of stdout lines (when enabled) | `5`                          |
| `e2b.command.stderr_lines` | Number of stderr lines (when enabled) | `2`                          |
| `e2b.command.background`   | Whether command ran in background     | `true`, `false`              |
| `e2b.file.operation`       | File operation type                   | `read`, `write`, `list`      |
| `e2b.file.path`            | File or directory path                | `/app/data.txt`              |
| `e2b.file.size_bytes`      | File size in bytes                    | `1024`                       |
| `e2b.file.format`          | Read format (for read ops)            | `text`, `bytes`              |
| `e2b.file.count`           | Number of files (list/write multiple) | `10`                         |

## Configuration Options

The instrumentation accepts optional configuration to control what metadata to capture:

- `tracerName` - Custom tracer name (default: `"@kubiks/otel-e2b"`)
- `captureFilePaths` - Capture file paths, not content (default: `true`)
- `captureFileSize` - Capture file sizes (default: `true`)
- `captureCodeLanguage` - Capture code execution language (default: `true`)
- `captureCommandOutput` - Capture command output line counts, not content (default: `false`)

Example:

```ts
instrumentSandbox(sandbox, {
  captureFilePaths: true,
  captureCommandOutput: true,
});
```

The instrumentation never captures sensitive data like code content, command arguments, file contents, or environment variables — only safe metadata like paths, sizes, exit codes, and language types.

## License

MIT
