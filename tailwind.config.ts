import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        popIn: {
          "0%":   { transform: "scale(0) rotate(-10deg)", opacity: "0" },
          "70%":  { transform: "scale(1.15) rotate(3deg)" },
          "100%": { transform: "scale(1) rotate(0deg)",   opacity: "1" },
        },
        popOut: {
          "0%":   { transform: "scale(1)",    opacity: "1" },
          "60%":  { transform: "scale(0.6)",  opacity: "0.5" },
          "100%": { transform: "scale(0)",    opacity: "0" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%":      { transform: "translateX(-6px)" },
          "40%":      { transform: "translateX(6px)" },
          "60%":      { transform: "translateX(-4px)" },
          "80%":      { transform: "translateX(4px)" },
        },
        scoreFloat: {
          "0%":   { transform: "translateY(0)",   opacity: "1" },
          "100%": { transform: "translateY(-40px)", opacity: "0" },
        },
        pulse2: {
          "0%, 100%": { transform: "scale(1)" },
          "50%":      { transform: "scale(1.05)" },
        },
        comboPulse: {
          "0%, 100%": { opacity: "0.9" },
          "50%":      { opacity: "0.08" },
        },
      },
      animation: {
        "pop-in":      "popIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "pop-out":     "popOut 0.18s ease-in forwards",
        "shake":       "shake 0.35s ease",
        "score-float": "scoreFloat 0.8s ease-out forwards",
        "pulse2":      "pulse2 1s ease-in-out infinite",
        "combo-pulse": "comboPulse 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
