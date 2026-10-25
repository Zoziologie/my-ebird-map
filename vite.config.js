import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "/myebirdmap/",
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ["mixed-decls", "color-functions", "global-builtin", "import"],
      },
    },
  },
});
