import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// O site fica em https://formigacamuflada.github.io/braciv/ — por isso o "base".
export default defineConfig({
  base: "/braciv/",
  plugins: [react(), tailwindcss()],
});
