import './globals.css';

export const metadata = {
  title: 'Graphify Studio',
  description:
    'Draft Graphify release posts and send them to Discord after you click Send. Announcements and Reddit stay copy-paste.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
