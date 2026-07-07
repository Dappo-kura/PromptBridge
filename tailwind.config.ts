import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#16181d",
        panelBorder: "#2a2e37",
        accent: "#4f8cff",
      },
    },
  },
  plugins: [],
};

export default config;
