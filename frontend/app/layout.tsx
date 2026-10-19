import type { Metadata } from 'next';
import './globals.css';
import { PoolProvider } from '../context/PoolContext';
import Navbar from '../components/Navbar';
import ToastStack from '../components/ToastStack';

export const metadata: Metadata = {
  title: 'CampusPool BLR · Smart RVCE Ride Sharing',
  description:
    'Graph-based real-time ride-matching for RVCE students across the Bengaluru Purple Metro corridor.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning className="relative min-h-screen">
        <PoolProvider>
          <Navbar />
          <main className="relative z-10">{children}</main>
          <ToastStack />
        </PoolProvider>
      </body>
    </html>
  );
}
