import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config = {
  darkMode: ["class", ".dark"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          green: "hsl(var(--accent-green))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Surface scale — used by SectionCard / StatCard / EmptyState.
        // bg-surface       → default card background
        // bg-surface-muted → "subdued" panels (filter strips, helpers)
        // bg-surface-soft  → tinted highlight (icon circles, soft CTAs)
        surface: {
          DEFAULT: "hsl(var(--surface))",
          muted: "hsl(var(--surface-muted))",
          soft: "hsl(var(--surface-soft))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        // 4px / 6px / 8px / 12px (default --radius) / 16px / 24px
        // Used by Card (lg), Pill / CTA (full), Hero block (2xl).
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 12px)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        // SaaS-grade defaults for cards / interactive surfaces:
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        glow: "var(--shadow-glow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Shimmer used by <Skeleton> / <SkeletonText> / <SkeletonCard>.
        // Sweeps a soft white-to-transparent band across the surface.
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        // Pépite reveal — mobile-game card-pull entrance. The card
        // arrives from below with a small overshoot, then idles with a
        // gentle hover.
        "pepite-pop": {
          "0%":   { transform: "translateY(40px) scale(0.6)", opacity: "0" },
          "60%":  { transform: "translateY(-8px) scale(1.04)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "pepite-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-6px)" },
        },
        "pepite-glow": {
          "0%, 100%": { filter: "drop-shadow(0 0 12px hsl(var(--primary) / 0.45))" },
          "50%":      { filter: "drop-shadow(0 0 28px hsl(var(--primary) / 0.75))" },
        },
        // Sparkle ring — the bright halo behind the card when it idles.
        "pepite-halo": {
          "0%":   { transform: "scale(0.6)", opacity: "0" },
          "60%":  { transform: "scale(1.15)", opacity: "0.7" },
          "100%": { transform: "scale(1.4)", opacity: "0" },
        },
        // Sparkle particles flying outward — the gaming "card pull"
        // burst. Each particle picks its own delay + angle via inline
        // style; this keyframe just handles the radial flight.
        "pepite-spark": {
          "0%":   { transform: "translate(0,0) scale(0)", opacity: "0" },
          "30%":  { opacity: "1" },
          "100%": { transform: "translate(var(--sx), var(--sy)) scale(1)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 1.6s infinite",
        "pepite-pop": "pepite-pop 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "pepite-float": "pepite-float 3.4s ease-in-out infinite",
        "pepite-glow": "pepite-glow 2.4s ease-in-out infinite",
        "pepite-halo": "pepite-halo 2s ease-out infinite",
        "pepite-spark": "pepite-spark 1.2s ease-out forwards",
      },
    },
  },
  plugins: [animate],
} satisfies Config;

export default config;
