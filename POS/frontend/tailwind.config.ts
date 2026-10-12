import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#061161",
          hover: "#0A1C8C",
          light: "#EDEFF9",
          dark: "#040B3F",
        },
        accent: "#780206",
        sidebar: {
          DEFAULT: "#061161",
          hover: "#141B7D",
          active: "#1B25A5",
        },
        appbg: "#FFFFFF",
        surface: "#FFFFFF",
        border: {
          DEFAULT: "#DADDE6",
        },
        txt: {
          primary: "#0B0E1A",
          secondary: "#4A5060",
          light: "#6B7183",
        },
        success: "#16803C",
        warning: "#B7791F",
        danger: "#C62828",
        info: "#2563EB",
      },
    },
  },
  plugins: [],
};

export default config;
