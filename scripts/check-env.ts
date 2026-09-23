/**
 * Validates the environment exactly as the production server will at startup.
 * Run it on the server before deploying:
 *   docker exec valuos-app node --import tsx scripts/check-env.ts   (or)
 *   pnpm env:check   (with the production variables loaded)
 * Prints only variable names and problems, never values.
 */
Object.assign(process.env, { NODE_ENV: "production" });

async function checkEnv() {
  try {
    await import("../src/lib/env");
    console.log("Configuración válida.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void checkEnv();

export {};
