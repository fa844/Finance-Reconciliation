'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useHeaderRight } from '@/app/contexts/HeaderRightContext'

const PAGES = [
  { name: 'Bookings', path: '/data' },
  { name: 'Uploads', path: '/uploads' },
  { name: 'Edits', path: '/history' },
  { name: 'Dashboard', path: '/dashboard' },
] as const

export default function TopNav() {
  const pathname = usePathname()
  const { rightContent } = useHeaderRight()

  return (
    <nav className="sticky top-0 z-50 bg-white border-b-4 border-orange-500 shadow-md">
      <div className="max-w-7xl mx-auto pl-0 pr-4 sm:pr-6 lg:pr-8 py-2">
        <div className="flex flex-nowrap justify-between items-center gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-3 min-w-0 -ml-1">
            <Link
              href="/data"
              className="shrink-0 -ml-2 flex items-center no-underline"
              aria-label="ZUZU Home"
            >
              <Image
                src="/zuzu-logo.png"
                alt="ZUZU"
                width={56}
                height={40}
                className="h-9 w-auto"
              />
            </Link>
            {PAGES.map(({ name, path }) => {
              const isActive = pathname === path || (path === '/data' && pathname?.startsWith('/data'))
              return (
                <Link
                  key={path}
                  href={path}
                  className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition duration-200 ${
                    isActive
                      ? 'bg-gray-400 text-white cursor-default pointer-events-none'
                      : 'bg-orange-500 text-white hover:bg-orange-600'
                  }`}
                >
                  {name}
                </Link>
              )
            })}
          </div>
          {rightContent && (
            <div className="flex items-center flex-nowrap gap-3 min-w-0 overflow-x-auto overflow-y-hidden shrink-0">
              {rightContent}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
