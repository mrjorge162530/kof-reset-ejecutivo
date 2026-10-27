import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "kof-reset-ejecutivo",
    "compatibilityDate": "2026-09-21",
    "observability": {
      "enabled": true
    }
  }
});
