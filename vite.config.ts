import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare Vite plugin runs the Worker (API + agent) and the React frontend together,
// both in `vite dev` and in the production build.
//
// Workers AI is a "remote binding": in local dev it calls your Cloudflare account (needs `wrangler login`).
// Without a Cloudflare login (e.g. CI), start with CF_REMOTE_BINDINGS=false – everything that uses
// Gemini keeps working, only the Workers AI fallback / memory model is unavailable.
export default defineConfig({
	plugins: [react(), cloudflare({ remoteBindings: process.env.CF_REMOTE_BINDINGS !== "false" })],
});
