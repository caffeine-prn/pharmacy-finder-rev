// frontend/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-pretendard)", "Pretendard Variable", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        pharmacy: {
          DEFAULT: "#059669",   // emerald-600
          light: "#d1fae5",     // emerald-100
        },
        herbal: {
          DEFAULT: "#e11d48",   // rose-600
          light: "#ffe4e6",     // rose-100
        },
        animal: {
          DEFAULT: "#ea580c",   // orange-600
          light: "#ffedd5",     // orange-100
        },
        cross: {
          DEFAULT: "#7c3aed",   // violet-600
          light: "#ede9fe",     // violet-100
        },
      },
    },
  },
  plugins: [],
};

export default config;
