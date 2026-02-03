import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BirdCam Network - AI Bird Watching',
  description: 'Connect your feeder cam, identify species with AI, name your regular visitors.',
  keywords: ['bird watching', 'bird feeder camera', 'bird identification', 'AI'],
  authors: [{ name: 'BirdCam Network' }],
  openGraph: {
    title: 'BirdCam Network',
    description: 'Your window to nature. AI-powered bird watching.',
    type: 'website',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
