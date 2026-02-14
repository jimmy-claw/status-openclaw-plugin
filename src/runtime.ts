import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setStatusRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getStatusRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Status runtime not initialized");
  }
  return runtime;
}
