import './globals.css';

export const metadata = {
  title: 'Graphify Discord Studio',
  description:
    'Draft ready-to-paste Discord posts for #production-releases and #announcements.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
