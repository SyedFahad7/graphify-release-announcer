import './globals.css';

export const metadata = {
  title: 'Graphify Release Announcer',
  description: 'One click → a ready-to-paste #production-releases announcement for the latest Graphify release.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
