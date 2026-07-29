# Chromation Plugin SDK

Chromation plugins are sandboxed JavaScript bundles with a validated manifest.
Plugins cannot access Node.js `process`, `require`, the filesystem, or the
network unless a future capability explicitly provides that access.

## Manifest

```json
{
  "id": "example.echo",
  "name": "Echo Action",
  "version": "1.0.0",
  "apiVersion": "1.0.0",
  "description": "Adds a custom echo action.",
  "permissions": ["actions:register", "runs:read"],
  "configuration": {
    "prefix": {
      "type": "string",
      "title": "Message prefix",
      "default": "Echo"
    }
  }
}
```

Every requested permission must be explicitly approved before the plugin can
be enabled. Changing a manifest's permissions requires another approval.

## Entry source

```js
function activate(chromation) {
  chromation.actions.register({
    id: 'echo.action',
    label: 'Echo value',
    execute(payload) {
      const config = chromation.configuration.get();
      return { message: `${config.prefix}: ${payload.value}` };
    }
  });

  chromation.lifecycle.on('run:complete', (run) => {
    console.log('Run completed', run.runId);
  });
}
```

Plugins can register actions, assertions, exporters, healing strategies, and
commands. Lifecycle events include activation, deactivation, run start/run
complete, step start/step complete, and report complete.

## Custom action in a recording

```json
{
  "type": "plugin",
  "selector": "echo.action",
  "timestamp": 1,
  "metadata": {
    "extensionId": "echo.action",
    "payload": { "value": "hello" }
  }
}
```

Plugin failures are isolated and recorded on the plugin. Lifecycle failures do
not stop other plugins. A custom action failure fails only that automation
step according to the normal continue-on-failure policy.

## Security limits

- No Node.js globals, dynamic code generation, or WebAssembly.
- Activation and handler execution have time limits.
- Inputs and outputs cross a JSON-serializable boundary.
- Storage values are limited to 64 KB.
- API major versions must match.
- Duplicate extension identifiers are rejected.
