import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "PingFang SC", "Hiragino Sans GB",
          "Microsoft YaHei", "Segoe UI", "Roboto", "sans-serif",
        ],
        song: ['"Songti SC"', '"Noto Serif SC"', "STSong", "SimSun", "serif"],
        kai: ['"Kaiti SC"', "STKaiti", '"KaiTi"', '"Ma Shan Zheng"', '"Noto Serif SC"', "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // 印章色
        cinnabar: { DEFAULT: "#C93329", deep: "#A82820" },
        crimson: "#9E1C2E",
        inknava: "#213D73",
        ink: "#242120",
        paper: { 50: "#FBF9F5", 100: "#F6F2EA", 200: "#EDE7DA", 300: "#DFD6C2" },
        desk: "#EFE9DE",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        ripple: {
          "0%": { opacity: "0.9", transform: "scale(0.7)" },
          "100%": { opacity: "0", transform: "scale(1.35)" },
        },
        press: {
          "0%": { transform: "translate(-50%,-50%) scale(1.18) rotate(0.001deg)" },
          "55%": { transform: "translate(-50%,-50%) scale(0.94) rotate(0.001deg)" },
          "100%": { transform: "translate(-50%,-50%) scale(1) rotate(0.001deg)" },
        },
        boing: {
          "0%": { transform: "scale(1,1)" },
          "30%": { transform: "scale(1.18,0.82)" },
          "55%": { transform: "scale(0.92,1.1)" },
          "75%": { transform: "scale(1.04,0.96)" },
          "100%": { transform: "scale(1,1)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "wiggle": {
          "0%,100%": { transform: "rotate(-1.2deg)" },
          "50%": { transform: "rotate(1.2deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.5s ease both",
        ripple: "ripple 0.55s cubic-bezier(0.22,1,0.36,1) forwards",
        press: "press 0.28s cubic-bezier(0.34,1.56,0.64,1) forwards",
        boing: "boing 0.5s cubic-bezier(0.34,1.56,0.64,1)",
        float: "float 5s ease-in-out infinite",
        wiggle: "wiggle 2.4s ease-in-out infinite",
      },
      boxShadow: {
        paper: "0 1px 2px rgba(36,33,32,0.06), 0 12px 32px -8px rgba(36,33,32,0.18), 0 32px 64px -24px rgba(36,33,32,0.22)",
        pop: "0 2px 4px rgba(36,33,32,0.08), 0 8px 24px -6px rgba(36,33,32,0.16)",
        desk: "inset 0 2px 24px rgba(36,33,32,0.07)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
