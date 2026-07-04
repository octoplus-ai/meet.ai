import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Small dev-only proxy.
 * The browser cannot call the Anthropic API directly (it needs a secret key,
 * which must never live in front-end code). So the app POSTs to /api/anthropic,
 * and this middleware forwards the request to Anthropic with your key attached.
 */
function anthropicProxy(apiKey) {
  return {
    name: "anthropic-proxy",
    configureServer(server) {
      server.middlewares.use("/api/anthropic", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end("Method not allowed");
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            return res.end(JSON.stringify({ error: "Falta ANTHROPIC_API_KEY en el archivo .env" }));
          }
          try {
            const r = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
              },
              body,
            });
            const text = await r.text();
            res.statusCode = r.status;
            res.setHeader("content-type", "application/json");
            res.end(text);
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), anthropicProxy(env.ANTHROPIC_API_KEY)],
    server: { port: 5173, open: true },
    build: {
      rollupOptions: {
        output: {
          // Split heavy, stable vendor code out of the single app chunk. These now download in
          // parallel with the app code AND stay cached across deploys (an app-code change no longer
          // busts the vendor cache), so repeat visits and first paint are faster. recharts + its d3
          // deps are the biggest single slice of the old ~1.2MB monolith.
          manualChunks: {
            react: ["react", "react-dom"],
            recharts: ["recharts"],
            icons: ["lucide-react"],
          },
        },
      },
    },
  };
});
