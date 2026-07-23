import './globals.css';

export const metadata = {
  title: 'Graphify Studio',
  description:
    'Draft ready-to-paste Discord (#production-releases, #announcements) and Reddit posts. Nothing auto-posts.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
