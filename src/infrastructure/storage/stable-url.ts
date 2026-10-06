import { storedImageUrl } from "@/features/files/services/stored-image-url";
import { getStorageConfig } from "@/infrastructure/storage/storage";
import { storageProvider } from "@/infrastructure/storage/storage-provider";

/**
 * The address to hand to a browser for a stored image: one that does not
 * expire. Local storage already serves its files from a fixed path.
 */
export async function stableDownloadUrl(key: string) {
  return getStorageConfig().driver === "s3" ? storedImageUrl(key) : storageProvider.getPrivateDownloadUrl(key);
}
