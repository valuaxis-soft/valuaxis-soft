const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class PublicAppUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicAppUrlError";
  }
}

export function getPublicAppUrl(
  environment: Pick<NodeJS.ProcessEnv, "APP_URL" | "NODE_ENV"> | NodeJS.ProcessEnv = process.env,
) {
  const value = environment.APP_URL?.trim();
  if (!value) {
    throw new PublicAppUrlError("APP_URL is required.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicAppUrlError("APP_URL must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new PublicAppUrlError("APP_URL must use http or https.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new PublicAppUrlError("APP_URL must not include credentials, query string or hash.");
  }

  const isLocalhost = LOCAL_HOSTS.has(url.hostname);
  if (environment.NODE_ENV === "production" && isLocalhost) {
    throw new PublicAppUrlError("APP_URL cannot point to localhost in production.");
  }

  if (isLocalhost && url.protocol !== "http:") {
    throw new PublicAppUrlError("Local development APP_URL must use http.");
  }

  if (!isLocalhost && url.protocol !== "https:" && environment.NODE_ENV === "production") {
    throw new PublicAppUrlError("Production APP_URL must use https.");
  }

  return url.origin;
}

export function buildPublicAppUrl(
  path: string,
  environment: Pick<NodeJS.ProcessEnv, "APP_URL" | "NODE_ENV"> | NodeJS.ProcessEnv = process.env,
) {
  if (!path.startsWith("/")) {
    throw new PublicAppUrlError("Public app paths must start with /.");
  }

  return new URL(path, getPublicAppUrl(environment));
}
