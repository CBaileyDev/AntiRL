import { invoke as nativeInvoke } from "@tauri-apps/api/core";
import { commands } from "./bindings";

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Transport compatibility for dynamic evidence tools; only top-level IPC argument keys change. */
export async function invoke<T = unknown>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauri()) return {} as T;
  const camelArgs = Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
  return nativeInvoke<T>(command, camelArgs);
}

/** Generated methods preserve Rust request/response types through the UI. */
export const ipc = Object.fromEntries(
  Object.entries(commands).map(([name, command]) => [
    name,
    (...args: unknown[]) => {
      if (!isTauri()) return Promise.resolve({});
      return Reflect.apply(command, undefined, args);
    },
  ]),
) as typeof commands;
