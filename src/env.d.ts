/**
 * Secrets are not part of wrangler.jsonc, so `wrangler types` only knows them when a .dev.vars file
 * exists. Declaring them here keeps the types stable for everyone.
 */
interface __BaseEnv_Env {
	GEMINI_API_KEY: string;
	SESSION_SECRET: string;
	ANTHROPIC_API_KEY: string;
}
