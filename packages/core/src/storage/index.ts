import { createLocalStorageProvider, localProvider } from "./local";
import { createMemoryStorageProvider } from "./memory";
import { r2Provider } from "./r2";
import { supabaseProvider } from "./supabase";
import type { StorageProvider, StorageProviderName } from "./types";

export type {
  StorageProvider,
  StorageProviderName,
  UploadInput,
  UploadResult,
} from "./types";
export { createLocalStorageProvider } from "./local";
export { createMemoryStorageProvider } from "./memory";

const builtins: Record<
  Exclude<StorageProviderName, "memory">,
  StorageProvider
> = {
  r2: r2Provider,
  supabase: supabaseProvider,
  local: localProvider,
};

/**
 * Resolve a StorageProvider for the web app's env-driven setup. The desktop
 * doesn't call this — it builds its own provider via `createMemoryStorageProvider`
 * (Phase 1) or `createLocalStorageProvider(<user data dir>)` (Phase 2) and
 * passes the instance directly to the PlatformAdapter.
 */
export function getStorage(override?: StorageProviderName): StorageProvider {
  const name = (override ??
    (process.env.STORAGE_PROVIDER as StorageProviderName | undefined) ??
    "local") as StorageProviderName;
  if (name === "memory") return createMemoryStorageProvider();
  const provider = builtins[name];
  if (!provider) {
    throw new Error(`Unknown storage provider: ${name}`);
  }
  return provider;
}
