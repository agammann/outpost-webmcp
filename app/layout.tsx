import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const siteUrl = 'https://outpost-webmcp.alx21.chatgpt.site';

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Outpost',
  url: siteUrl,
  description:
    'A shared security triage workspace for human analysts and AI agents, powered by browser-native WebMCP tools.',
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'Any',
  browserRequirements:
    'Requires a modern web browser; WebMCP tools require a compatible browser.',
  isAccessibleForFree: true,
  sameAs: ['https://github.com/agammann/outpost-webmcp'],
  featureList: [
    'Shared human and AI security-triage workspace',
    'Fourteen browser-native WebMCP tools',
    'Explainable finding prioritization',
    'Capacity-aware remediation sprint planning',
    'Human locks, activity history, and portable workspace backups',
  ],
};

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Outpost — Human judgment. Agent speed.',
  description:
    'A shared security triage workspace for human analysts and AI agents, powered by WebMCP.',
  applicationName: 'Outpost',
  keywords: [
    'WebMCP',
    'security triage',
    'human in the loop',
    'AI agents',
    'remediation planning',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Outpost — Human judgment. Agent speed.',
    description:
      'Explainable security triage and capacity-aware remediation planning through browser-native WebMCP tools.',
    type: 'website',
    images: [
      {
        url: '/outpost-social.png',
        width: 1672,
        height: 941,
        alt: 'Outpost human-in-the-loop security triage workspace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Outpost — Human judgment. Agent speed.',
    description:
      'Explainable security triage and remediation planning through browser-native WebMCP tools.',
    images: ['/outpost-social.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
          }}
        />
        {children}
      </body>
    </html>
  );
}
