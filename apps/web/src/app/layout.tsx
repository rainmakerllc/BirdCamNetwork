import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { SolanaProvider } from '@/components/providers/SolanaProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BirdCam Network - AI Bird Watching',
  description: 'Connect your feeder cam, identify species with AI, name your regular visitors, and mint sightings as NFTs on Solana.',
  keywords: ['bird watching', 'bird feeder camera', 'bird identification', 'AI', 'NFT', 'Solana'],
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
          <SolanaProvider>
            {children}
          </SolanaProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
