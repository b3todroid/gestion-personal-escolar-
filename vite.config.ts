import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { createHash } from "node:crypto";

/** Genera sw.js con la lista de archivos de esta versión: la app abre sin internet después de la primera visita. */
function offlineWorker(): Plugin {
  return {
    name: "offline-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const files = ["./", ...Object.keys(bundle), "manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"].map((f) => (f === "./" ? f : `./${f}`));
      const version = createHash("sha1").update(files.join("|") + Object.values(bundle).map((b) => ("code" in b ? b.code.length : 0)).join(",")).digest("hex").slice(0, 10);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const CACHE = "gpe-${version}";
const FILES = ${JSON.stringify(files)};
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match("./"))));
});
`,
      });
    },
  };
}

// base "./" permite publicar en GitHub Pages (subcarpeta) sin configurar nada más.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), offlineWorker()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
