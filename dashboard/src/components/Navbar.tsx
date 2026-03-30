'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'نظرة عامة' },
  { href: '/screener', label: 'فرز الأسهم' },
  { href: '/recommendations', label: 'التوصيات' },
  { href: '/sectors', label: 'تقارير القطاعات' },
  { href: '/portfolio', label: 'المحفظة النموذجية' },
  { href: '/watchlist', label: 'قائمة المتابعة' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-tasi-card border-b border-tasi-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="text-lg font-bold text-tasi-gold font-arabic">
            📊 تحليل تاسي
          </Link>
          <div className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-md text-sm font-arabic transition-colors ${
                  pathname === link.href
                    ? 'bg-tasi-gold/20 text-tasi-gold'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
