import { defineConfig } from "vite";

export default defineConfig({
  base: "/tennislive-match/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
