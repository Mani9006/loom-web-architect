import type { Config } from "tailwindcss";

export default {
	darkMode: "class",
	content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: [
					'Inter',
					'ui-sans-serif',
					'system-ui',
					'-apple-system',
					'Segoe UI',
					'sans-serif',
					'Apple Color Emoji',
					'Segoe UI Emoji'
				],
				serif: [
					'Source Serif 4',
					'ui-serif',
					'Georgia',
					'Cambria',
					'Times New Roman',
					'serif'
				],
				display: [
					'Source Serif 4',
					'ui-serif',
					'Georgia',
					'serif'
				],
				mono: [
					'JetBrains Mono',
					'ui-monospace',
					'SFMono-Regular',
					'Menlo',
					'Monaco',
					'Consolas',
					'Liberation Mono',
					'Courier New',
					'monospace'
				]
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Utility palette — INVERTED. Pure black canvas, white text.
				// The CanonicalTemplate (resume preview) keeps its own white
				// paper internally so the printed CV looks correct against
				// the dark page.
				'rp-canvas': '#0A0A0A',      // page background — near-black
				'rp-paper':  '#171717',      // subtle inset (cards, hover) — neutral-900
				'rp-paper-2':'#262626',      // pressed / nested panels — neutral-800
				'rp-ink':    '#FAFAFA',      // primary text — soft white
				'rp-ink-2':  '#A3A3A3',      // secondary text — neutral-400
				'rp-ink-3':  '#737373',      // tertiary text — neutral-500
				'rp-rule':   '#262626',      // hairline borders — neutral-800
				'rp-rule-2': '#404040',      // stronger borders — neutral-700
				// Nothing-style red — used for the terminal cursor, focus rings,
				// and one-per-screen accent moments. Bright but not neon.
				'rp-accent':  '#FF3B30',     // signal red
				'rp-accent-2':'#FF6259'      // lighter for hover
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				'2xl': 'calc(var(--radius) + 4px)',
				'3xl': 'calc(var(--radius) + 8px)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			},
			boxShadow: {
				'2xs': 'var(--shadow-2xs)',
				xs: 'var(--shadow-xs)',
				sm: 'var(--shadow-sm)',
				md: 'var(--shadow-md)',
				lg: 'var(--shadow-lg)',
				xl: 'var(--shadow-xl)',
				'2xl': 'var(--shadow-2xl)'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
