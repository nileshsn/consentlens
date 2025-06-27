"use client"
import { Brain } from "lucide-react"
import Image from "next/image"

interface FooterProps {
  onNavigateToLearn?: () => void
  onNavigateToHome?: () => void
  onNavigateToProfile?: () => void
  onOpenAuth?: (mode: "signin" | "signup") => void
}

export function Footer({
  onNavigateToLearn,
  onNavigateToHome,
  onNavigateToProfile,
  onOpenAuth,
}: FooterProps) {
  const currentYear = new Date().getFullYear()
  return (
    <footer className="bg-gray-900 text-gray-200 py-4 px-2 sm:px-6 mt-8 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0">
        <div className="flex items-center space-x-2 mb-2 sm:mb-0">
          <Image src="/favicon.png" alt="ConsentLens Logo" width={20} height={20} className="rounded-full" />
          <span className="font-semibold tracking-tight text-xs sm:text-base">consentlens</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-xs sm:text-sm text-gray-400">
          <button onClick={onNavigateToHome} className="hover:text-white transition-colors">PRODUCT</button>
          <span className="mx-1">/</span>
          <button onClick={onNavigateToLearn} className="hover:text-white transition-colors">RESEARCH</button>
          <span className="mx-1">/</span>
          <button onClick={() => onOpenAuth && onOpenAuth('signin')} className="hover:text-white transition-colors">SIGN IN</button>
          <span className="mx-1">/</span>
          <button onClick={() => onOpenAuth && onOpenAuth('signup')} className="hover:text-white transition-colors">SIGN UP</button>
          {onNavigateToProfile && (
            <>
              <span className="mx-1">/</span>
              <button onClick={onNavigateToProfile} className="hover:text-white transition-colors">PROFILE</button>
            </>
          )}
        </nav>
        <div className="text-[10px] sm:text-xs text-gray-400 mt-2 sm:mt-0 text-center">
          © {currentYear} CONSENTLENS
        </div>
      </div>
    </footer>
  )
}
