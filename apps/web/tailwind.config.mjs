import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("./", import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [`${here}src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}`],
  theme: {
    extend: {
      colors: {
        bg:       "#07090d",
        bg2:      "#0d1117",
        surface:  "#0f141b",
        panel:    "#161b22",
        panel2:   "#1c232c",
        border:   "#30363d",
        border2:  "#21262d",
        ink:      "#e6edf3",
        muted:    "#8b949e",
        muted2:   "#6e7681",
        blue:     "#58a6ff",
        blueDim:  "#1f6feb",
        purple:   "#bc8cff",
        magenta:  "#d670d6",
        amber:    "#d29922",
        green:    "#3fb950",
        red:      "#f85149",
        addBg:    "rgba(46,160,67,0.15)",
        addInk:   "#7ee787",
        delBg:    "rgba(248,81,73,0.15)",
        delInk:   "#ffa198",
      },
      fontFamily: {
        display: ['"Instrument Serif"', "ui-serif", "Georgia", "serif"],
        mono:    ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans:    ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        widest2:  "0.18em",
      },
    },
  },
  plugins: [],
};
