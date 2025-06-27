"use client"
import { Brain } from "lucide-react"

interface FooterProps {
  onNavigateToLearn?: () => void
  onNavigateToHome?: () => void
  onNavigateToProfile?: () => void
  onOpenAuth?: (mode: "signin" | "signup") => void
}

export function Footer({ onNavigateToLearn, onNavigateToHome, onNavigateToProfile, onOpenAuth }: FooterProps) {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0">
          {/* Brand */}
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
              <Brain className="w-3 h-3 text-white" />
            </div>
            <span className="text-lg font-medium">consentlens</span>
          </div>

          {/* Links */}
          <div className="flex items-center space-x-1 text-sm text-gray-400">
            <span>© {currentYear} CONSENTLENS</span>
            <span className="mx-2">/</span>
            <button onClick={onNavigateToHome} className="hover:text-white transition-colors">
              PRODUCT
            </button>
            <span className="mx-2">/</span>
            <button onClick={onNavigateToLearn} className="hover:text-white transition-colors">
              RESEARCH
            </button>
            <span className="mx-2">/</span>
            <button onClick={() => onOpenAuth?.("signin")} className="hover:text-white transition-colors">
              SIGN IN
            </button>
            <span className="mx-2">/</span>
            <button onClick={() => onOpenAuth?.("signup")} className="hover:text-white transition-colors">
              SIGN UP
            </button>
            {onNavigateToProfile && (
              <>
                <span className="mx-2">/</span>
                <button onClick={onNavigateToProfile} className="hover:text-white transition-colors">
                  PROFILE
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
