import { localProvider } from "./local";
import { r2Provider } from "./r2";
import { supabaseProvider } from "./supabase";
import type { StorageProvider, StorageProviderName } from "./types";

export type { StorageProvider, UploadInput, UploadResult } from "./types";

const providers: Record<StorageProviderName, StorageProvider> = {
  r2: r2Provider,
  supabase: supabaseProvider,
  local: localProvider,
};

export function getStorage(override?: StorageProviderName): StorageProvider {
  const name = (override ??
    (process.env.STORAGE_PROVIDER as StorageProviderName | undefined) ??
    "local") as StorageProviderName;
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown storage provider: ${name}`);
  }
  return provider;
}
