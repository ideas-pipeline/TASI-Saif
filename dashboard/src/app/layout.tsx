import type { Metadata } from 'next';
import './globals.css';
import Navbar from '../components/Navbar';

export const metadata: Metadata = {
  title: 'تحليل تاسي - منصة تحليل الأسهم السعودية بالذكاء الاصطناعي',
  description: 'منصة تحليل أسهم السوق السعودي (تاسي) باستخدام الذكاء الاصطناعي - تحليل فني وأساسي وتوصيات',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen font-arabic">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
