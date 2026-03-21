import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
        },
        navy: {
          DEFAULT: "hsl(228, 33%, 6%)",
          50: "hsl(224, 20%, 95%)",
          100: "hsl(224, 20%, 90%)",
          200: "hsl(224, 20%, 80%)",
          300: "hsl(224, 20%, 65%)",
          400: "hsl(224, 20%, 50%)",
          500: "hsl(224, 25%, 35%)",
          600: "hsl(224, 28%, 25%)",
          700: "hsl(224, 30%, 18%)",
          800: "hsl(226, 35%, 12%)",
          900: "hsl(226, 35%, 9%)",
          950: "hsl(228, 33%, 6%)",
        },
        emerald: {
          DEFAULT: "hsl(160, 84%, 39%)",
          50: "hsl(160, 80%, 95%)",
          100: "hsl(160, 80%, 85%)",
          200: "hsl(160, 80%, 70%)",
          300: "hsl(160, 84%, 55%)",
          400: "hsl(160, 84%, 45%)",
          500: "hsl(160, 84%, 39%)",
          600: "hsl(160, 84%, 32%)",
          700: "hsl(160, 84%, 25%)",
          800: "hsl(160, 84%, 18%)",
          900: "hsl(160, 84%, 12%)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-in-from-top": {
          from: { transform: "translateY(-100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-in-from-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "fade-out": "fade-out 0.2s ease-out",
        "slide-in-from-top": "slide-in-from-top 0.3s ease-out",
        "slide-in-from-bottom": "slide-in-from-bottom 0.3s ease-out",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
