# @kubiks/otel-e2b

## 1.0.0

### Features

- Initial release of OpenTelemetry instrumentation for E2B Sandboxes
- **Core instrumentation functions**:
  - `instrumentSandbox()` - Instrument existing sandbox instances
  - `instrumentSandboxClass()` - Instrument Sandbox class for automatic instrumentation
- **Sandbox lifecycle tracing**:
  - `Sandbox.create()` - Sandbox creation with template information
  - `sandbox.kill()` - Sandbox termination
- **Code execution tracing**:
  - `sandbox.runCode()` - Code execution with language, error status, and execution count
- **File operations tracing**:
  - `sandbox.files.read()` - Read files with path, size, and format
  - `sandbox.files.write()` - Write single or multiple files
  - `sandbox.files.list()` - List directory contents with file counts
  - `sandbox.files.remove()` - Delete files or directories
  - `sandbox.files.makeDir()` - Create directories
- **Command execution tracing**:
  - `sandbox.commands.run()` - Execute shell commands with exit codes and output line counts
- **Security-first design**: Never captures sensitive data (code content, file contents, command arguments, etc.)
- **Comprehensive configuration options**: Control what metadata to capture
- **Idempotent instrumentation**: Safe to call multiple times
- **Full TypeScript support** with complete type definitions
- **OpenTelemetry semantic conventions** for all span attributes
