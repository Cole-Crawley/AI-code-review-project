import type { Metadata, Viewport } from 'next';
import { Oxanium, Inter, Kode_Mono } from 'next/font/google';

// Oxanium — square, futuristic, built for tech/AI/gaming headlines
const display = Oxanium({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
  display: 'swap',
  preload: true,
});

// Inter — screen-optimised, legible, neutral body copy
const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
});

// Kode Mono — precise developer vibe for all code/mono contexts
const mono = Kode_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'CodeRev — AI Code Review',
  description: 'Instant AI-powered code review for JavaScript and TypeScript. Get line-by-line feedback on bugs, security issues, and best practices.',
  keywords: ['code review', 'AI', 'TypeScript', 'JavaScript', 'linting', 'static analysis'],
  openGraph: {
    title: 'CodeRev — AI Code Review',
    description: 'Instant AI-powered code review for JavaScript and TypeScript.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0D0D0D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body style={{ margin: 0, padding: 0, background: '#0D0D0D' }}>
        {children}
      </body>
    </html>
  );
}
