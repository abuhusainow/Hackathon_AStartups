import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			// The tests never call Workers AI, so they run without a Cloudflare login (e.g. in CI).
			remoteBindings: false,
		}),
	],
});
