import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: "class",
	content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: "1.5rem",
			screens: {
				"2xl": "1440px",
			},
		},
		extend: {
			screens: {
				xs: "360px",
				"3xl": "1920px",
				uw: "2560px",
				uw2: "3440px",
				"5k": "5120px",
			},
			fontFamily: {
				sans: [
					"Instrument Sans",
					"ui-sans-serif",
					"system-ui",
					"sans-serif",
				],
				serif: [
					"Instrument Sans",
					"ui-sans-serif",
					"system-ui",
					"sans-serif",
				],
				display: [
					"Instrument Sans",
					"ui-sans-serif",
					"system-ui",
					"sans-serif",
				],
				mono: [
					"DM Mono",
					"ui-monospace",
					"SFMono-Regular",
					"Menlo",
					"monospace",
				],
			},
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
					DEFAULT: "hsl(var(--sidebar-background))",
					foreground: "hsl(var(--sidebar-foreground))",
					primary: "hsl(var(--sidebar-primary))",
					"primary-foreground": "hsl(var(--sidebar-primary-foreground))",
					accent: "hsl(var(--sidebar-accent))",
					"accent-foreground": "hsl(var(--sidebar-accent-foreground))",
					border: "hsl(var(--sidebar-border))",
					ring: "hsl(var(--sidebar-ring))",
				},
				"rp-canvas": "hsl(var(--rp-canvas) / <alpha-value>)",
				"rp-paper": "hsl(var(--rp-paper) / <alpha-value>)",
				"rp-paper-2": "hsl(var(--rp-paper-2) / <alpha-value>)",
				"rp-ink": "hsl(var(--rp-ink) / <alpha-value>)",
				"rp-ink-2": "hsl(var(--rp-ink-2) / <alpha-value>)",
				"rp-ink-3": "hsl(var(--rp-ink-3) / <alpha-value>)",
				"rp-rule": "hsl(var(--rp-rule) / <alpha-value>)",
				"rp-rule-2": "hsl(var(--rp-rule-2) / <alpha-value>)",
				"rp-accent": "hsl(var(--rp-accent) / <alpha-value>)",
				"rp-accent-2": "hsl(var(--rp-accent-2) / <alpha-value>)",
			},
			borderRadius: {
				lg: "var(--radius-panel)",
				md: "var(--radius)",
				sm: "calc(var(--radius) - 2px)",
				"2xl": "calc(var(--radius-panel) + 4px)",
				"3xl": "calc(var(--radius-panel) + 8px)",
			},
			transitionDuration: {
				DEFAULT: "180ms",
			},
			transitionTimingFunction: {
				rp: "cubic-bezier(0.16, 1, 0.3, 1)",
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
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
			},
			boxShadow: {
				"2xs": "var(--shadow-xs)",
				xs: "var(--shadow-xs)",
				sm: "var(--shadow-sm)",
				md: "var(--shadow-md)",
				lg: "var(--shadow-lg)",
				xl: "var(--shadow-xl)",
				"2xl": "var(--shadow-2xl)",
			},
		},
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
