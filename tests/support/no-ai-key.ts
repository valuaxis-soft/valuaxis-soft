/**
 * Imported first by tests that must run as an installation without the AI
 * key: src/lib/env.ts reads the environment when it loads.
 */
delete process.env.ANTHROPIC_API_KEY;

export {};
