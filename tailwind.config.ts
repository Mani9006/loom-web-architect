import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

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
				sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji'],
				// Mono is for data only: dates, salaries, IDs.
				mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
			},
			// One 7-step scale (rem, so it follows the user's font size).
			// Tailwind's default keys are snapped onto it so legacy classes land on-scale.
			fontSize: {
				xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],          // 12/16
				meta: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0.005em' }], // 13/18
				sm: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0' }],           // 14/20 base
				base: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.005em' }],       // 16/24
				lg: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.005em' }],         // 16/24 (legacy)
				xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],      // 20/28
				'2xl': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],   // 20/28 (legacy)
				'3xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],  // 28/34
				'4xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],  // 28/34 (legacy)
				'5xl': ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.03em' }],    // 40/44
				'6xl': ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.03em' }],    // 40/44 (legacy)
				'7xl': ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.03em' }],    // 40/44 (legacy)
				// Semantic aliases
				caption: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
				body: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0' }],
				'body-lg': ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.005em' }],
				title: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
				headline: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],
				display: ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.03em' }],
				// Marketing hero only (Landing h1 at >=sm). Not for product UI.
				hero: ['3.5rem', { lineHeight: '3.625rem', letterSpacing: '-0.035em' }]
			},
			fontWeight: {
				// 400/500/600 only. Heavier legacy weights collapse to 600.
				light: '400',
				extralight: '400',
				thin: '400',
				bold: '600',
				extrabold: '600',
				black: '600'
			},
			colors: {
				border: 'oklch(var(--border) / <alpha-value>)',
				input: 'oklch(var(--input) / <alpha-value>)',
				ring: 'oklch(var(--ring) / <alpha-value>)',
				background: 'oklch(var(--background) / <alpha-value>)',
				foreground: 'oklch(var(--foreground) / <alpha-value>)',
				primary: {
					DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
					foreground: 'oklch(var(--primary-foreground) / <alpha-value>)'
				},
				secondary: {
					DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',
					foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)'
				},
				destructive: {
					DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
					foreground: 'oklch(var(--destructive-foreground) / <alpha-value>)'
				},
				muted: {
					DEFAULT: 'oklch(var(--muted) / <alpha-value>)',
					foreground: 'oklch(var(--muted-foreground) / <alpha-value>)'
				},
				accent: {
					DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
					foreground: 'oklch(var(--accent-foreground) / <alpha-value>)'
				},
				popover: {
					DEFAULT: 'oklch(var(--popover) / <alpha-value>)',
					foreground: 'oklch(var(--popover-foreground) / <alpha-value>)'
				},
				card: {
					DEFAULT: 'oklch(var(--card) / <alpha-value>)',
					foreground: 'oklch(var(--card-foreground) / <alpha-value>)'
				},
				sidebar: {
					DEFAULT: 'oklch(var(--sidebar-background) / <alpha-value>)',
					foreground: 'oklch(var(--sidebar-foreground) / <alpha-value>)',
					primary: 'oklch(var(--sidebar-primary) / <alpha-value>)',
					'primary-foreground': 'oklch(var(--sidebar-primary-foreground) / <alpha-value>)',
					accent: 'oklch(var(--sidebar-accent) / <alpha-value>)',
					'accent-foreground': 'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
					border: 'oklch(var(--sidebar-border) / <alpha-value>)',
					ring: 'oklch(var(--sidebar-ring) / <alpha-value>)'
				},
				// ResumePreps editorial palette. CSS variables make the same
				// visual identity work in both light and dark themes.
				'rp-canvas': 'oklch(var(--rp-canvas) / <alpha-value>)',
				'rp-paper':  'oklch(var(--rp-paper) / <alpha-value>)',
				'rp-paper-2':'oklch(var(--rp-paper-2) / <alpha-value>)',
				'rp-ink':    'oklch(var(--rp-ink) / <alpha-value>)',
				'rp-ink-2':  'oklch(var(--rp-ink-2) / <alpha-value>)',
				'rp-ink-3':  'oklch(var(--rp-ink-3) / <alpha-value>)',
				'rp-rule':   'oklch(var(--rp-rule) / <alpha-value>)',
				'rp-rule-2': 'oklch(var(--rp-rule-2) / <alpha-value>)',
				'rp-accent': 'oklch(var(--rp-accent) / <alpha-value>)',
				'rp-accent-2':'oklch(var(--rp-accent-2) / <alpha-value>)',
				status: {
					applied: 'oklch(var(--status-applied) / <alpha-value>)',
					interview: 'oklch(var(--status-interview) / <alpha-value>)',
					offer: 'oklch(var(--status-offer) / <alpha-value>)',
					rejected: 'oklch(var(--status-rejected) / <alpha-value>)'
				},
				scrim: 'oklch(var(--scrim))'
			},
			// 6px controls, 10px sheets/popovers/cards. Nothing rounder except pills (full).
			borderRadius: {
				sm: '4px',
				md: '6px',
				lg: '10px',
				xl: '10px',
				'2xl': '10px',
				'3xl': '10px'
			},
			transitionTimingFunction: {
				out: 'cubic-bezier(0.22, 1, 0.36, 1)',
				in: 'cubic-bezier(0.64, 0, 0.78, 0)'
			},
			transitionDuration: {
				press: '90ms',
				state: '150ms',
				sheet: '280ms'
			},
			transitionProperty: {
				// Never `all`: name what moves.
				colors: 'color, background-color, border-color, text-decoration-color, fill, stroke',
				press: 'transform, color, background-color, border-color, box-shadow',
				surface: 'color, background-color, border-color, box-shadow, opacity'
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
			// No card shadows. Only floating layers (popover, menu, dialog, toast, sheet)
			// use shadow-overlay; the legacy scale resolves to nothing.
			boxShadow: {
				'2xs': 'var(--shadow-none)',
				xs: 'var(--shadow-none)',
				sm: 'var(--shadow-none)',
				md: 'var(--shadow-none)',
				lg: 'var(--shadow-none)',
				xl: 'var(--shadow-none)',
				'2xl': 'var(--shadow-none)',
				overlay: 'var(--shadow-overlay)'
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
