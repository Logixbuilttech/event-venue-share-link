import './globals.css';

export const metadata = {
  title: 'Event Managment',
  description: 'Design and visualize event',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}