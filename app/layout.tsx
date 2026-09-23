import type { Metadata, Viewport } from 'next';
import { Newsreader, Hanken_Grotesk, Courier_Prime, Nanum_Pen_Script } from 'next/font/google';
import './globals.css';

// Serif for headings and prose, like printed exam instructions
const serif = Newsreader({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
});

// Small interface text
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600'],
  display: 'swap',
});

// Code reads as if it were typed onto the page
const mono = Courier_Prime({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
  display: 'swap',
});

// The examiner's red pen, used only for margin notes
const pen = Nanum_Pen_Script({
  subsets: ['latin'],
  variable: '--font-pen',
  weight: '400',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CodeMarker',
  description: 'Hand in your code and get it back marked: line-by-line feedback on bugs, security and style for TypeScript, JavaScript, Python, C++, C# and Java.',
  openGraph: {
    title: 'CodeMarker',
    description: 'Hand in your code and get it back marked.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#EDE8DD',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning prevents React hydration errors caused by browser
    // extensions injecting attributes (data-extension-installed, etc.) onto <html>.
    <html lang="en" suppressHydrationWarning className={`${serif.variable} ${sans.variable} ${mono.variable} ${pen.variable}`}>
      <body>{children}</body>
    </html>
  );
}
