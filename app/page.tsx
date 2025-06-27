"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion"
import {
  Upload,
  FileText,
  Download,
  Copy,
  MessageCircle,
  Shield,
  CheckCircle,
  Eye,
  Lock,
  Users,
  Menu,
  X,
  Brain,
  TrendingUp,
  ArrowRight,
  Plus,
  Send,
  Check,
  Star,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AuthModal } from "@/components/auth/auth-modal"
import { UserProfile } from "@/components/user/user-profile"
import { ChatInterface } from "@/components/chat/chat-interface"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { Footer } from "@/components/layout/footer"
import Image from "next/image"

type ProcessingState = "idle" | "processing" | "completed"
type LawRegion = "gdpr" | "ccpa" | "dpdpa"
type ViewMode = "home" | "profile" | "learn" | "chat" | "results"

interface ActionRecommendation {
  title: string
  description: string
  severity: "low" | "medium" | "high"
  category: string
}

interface AnalysisResult {
  complianceScore: number
  riskLevel: "low" | "medium" | "high"
  keyPoints: string[]
  recommendations: ActionRecommendation[]
}

export default function ConsentLensApp() {
  const [processingState, setProcessingState] = useState<ProcessingState>("idle")
  const [selectedRegion, setSelectedRegion] = useState<LawRegion>("gdpr")
  const [documentText, setDocumentText] = useState("")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin")
  const [viewMode, setViewMode] = useState<ViewMode>("home")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [showAdvancedInput, setShowAdvancedInput] = useState(false)
  const [conversationInput, setConversationInput] = useState("")
  const [copiedToClipboard, setCopiedToClipboard] = useState(false)
  const [recentAnalyses, setRecentAnalyses] = useState<number>(0)

  const { user, loading: authLoading } = useAuth()

  // Refs for scroll animations
  const heroRef = useRef<HTMLDivElement>(null)

  // Scroll progress for hero section only
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })

  // Transform for subtle parallax effect (reduced intensity)
  const heroY = useTransform(heroScrollProgress, [0, 1], ["0%", "5%"])
  const heroOpacity = useTransform(heroScrollProgress, [0, 0.5], [1, 0.98])

  // Load user stats
  useEffect(() => {
    if (user) {
      loadUserStats()
    }
  }, [user])

  const loadUserStats = async () => {
    try {
      const { count } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)

      setRecentAnalyses(count || 0)
    } catch (error) {
      console.error("Error loading stats:", error)
    }
  }

  /* ------------------------------------------------------------------ */
  /* 🗂️  Helpers                                                        */
  /* ------------------------------------------------------------------ */
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-50 text-red-600 border-red-200"
      case "medium":
        return "bg-amber-50 text-amber-600 border-amber-200"
      case "low":
        return "bg-emerald-50 text-emerald-600 border-emerald-200"
      default:
        return "bg-gray-50 text-gray-600 border-gray-200"
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "privacy":
        return <Lock className="w-3 h-3" />
      case "data":
        return <Shield className="w-3 h-3" />
      case "rights":
        return <Users className="w-3 h-3" />
      case "terms":
        return <FileText className="w-3 h-3" />
      default:
        return <Eye className="w-3 h-3" />
    }
  }

  /* ------------------------------------------------------------------ */
  /* 📂  File / Text Input                                              */
  /* ------------------------------------------------------------------ */
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setUploadedFile(file)
      const reader = new FileReader()
      reader.onload = (e) => setDocumentText(e.target?.result as string)
      reader.readAsText(file)
    }
  }

  /* ------------------------------------------------------------------ */
  /* 🧠  Document Analysis                                              */
  /* ------------------------------------------------------------------ */
  const handleConversationAnalysis = async () => {
    if (!conversationInput.trim()) return
    if (!user) {
      setAuthModalOpen(true)
      return
    }

    setProcessingState("processing")
    setProgress(0)

    try {
      await supabase
        .from("user_profiles")
        .upsert(
          {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name ?? null,
          },
          { onConflict: "id" },
        )
        .throwOnError()

      const { data: documentInsert, error: docErr } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          title: `Analysis: ${conversationInput.slice(0, 50)}...`,
          content: conversationInput,
          file_type: "text/plain",
          law_region: selectedRegion,
        })
        .select()
        .single()

      if (docErr) throw docErr

      const progressInterval = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return p + 10
        })
      }, 300)

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: conversationInput,
          lawRegion: selectedRegion,
          documentId: documentInsert.id,
        }),
      })

      clearInterval(progressInterval)

      if (!res.ok) throw new Error("Analysis failed")
      const result: AnalysisResult = await res.json()
      setAnalysisResult(result)
      setDocumentText(conversationInput.trim())
      setProgress(100)
      setProcessingState("completed")
      setViewMode("results")
      loadUserStats() // Refresh stats
    } catch (error) {
      console.error("Analysis Error:", error)
      setProcessingState("idle")
    } finally {
      setConversationInput("") // Clear the input after submission
    }
  }

  const handleSummarize = async () => {
    if (!documentText && !uploadedFile) return
    if (!user) {
      setAuthModalOpen(true)
      return
    }

    setProcessingState("processing")
    setProgress(0)

    try {
      await supabase
        .from("user_profiles")
        .upsert(
          {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name ?? null,
          },
          { onConflict: "id" },
        )
        .throwOnError()

      const { data: documentInsert, error: docErr } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          title: uploadedFile?.name || "Pasted Document",
          content: documentText,
          file_type: uploadedFile?.type || "text/plain",
          law_region: selectedRegion,
        })
        .select()
        .single()

      if (docErr) throw docErr

      const progressInterval = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return p + 10
        })
      }, 300)

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: documentText,
          lawRegion: selectedRegion,
          documentId: documentInsert.id,
        }),
      })

      clearInterval(progressInterval)

      if (!res.ok) throw new Error("Analysis failed")
      const result: AnalysisResult = await res.json()
      setAnalysisResult(result)
      setProgress(100)
      setProcessingState("completed")
      setViewMode("results")
      loadUserStats() // Refresh stats
    } catch (err) {
      console.error("Analysis error:", err)
      setProcessingState("idle")
      setProgress(0)
    }
  }

  const handleCopyToClipboard = async () => {
    if (!analysisResult) return

    const summary = `ConsentLens Analysis Summary

Compliance Score: ${analysisResult.complianceScore}%
Risk Level: ${analysisResult.riskLevel.toUpperCase()}
Law Region: ${selectedRegion.toUpperCase()}

Key Points:
${analysisResult.keyPoints.map((point, i) => `${i + 1}. ${point}`).join("\n")}

Recommendations:
${analysisResult.recommendations.map((rec, i) => `${i + 1}. ${rec.title}: ${rec.description}`).join("\n")}

Generated by ConsentLens - AI for Clear Terms of Use`

    await navigator.clipboard.writeText(summary)
    setCopiedToClipboard(true)
    setTimeout(() => setCopiedToClipboard(false), 2000)
  }

  const handleDownloadReport = () => {
    if (!analysisResult) return

    const reportContent = `ConsentLens Analysis Report
Generated on: ${new Date().toLocaleDateString()}

COMPLIANCE ANALYSIS
==================
Compliance Score: ${analysisResult.complianceScore}%
Risk Level: ${analysisResult.riskLevel.toUpperCase()}
Law Region: ${selectedRegion.toUpperCase()}

KEY FINDINGS
============
${analysisResult.keyPoints.map((point, i) => `${i + 1}. ${point}`).join("\n")}

RECOMMENDATIONS
===============
${analysisResult.recommendations
  .map(
    (rec, i) => `
${i + 1}. ${rec.title}
   Category: ${rec.category}
   Severity: ${rec.severity.toUpperCase()}
   Description: ${rec.description}
`,
  )
  .join("\n")}

DISCLAIMER
==========
This analysis is generated by AI and should not be considered as legal advice. 
Please consult with a qualified legal professional for specific legal matters.

Generated by ConsentLens - AI for Clear Terms of Use
https://consentlens.com`

    const blob = new Blob([reportContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ConsentLens-Report-${new Date().toISOString().split("T")[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /* ------------------------------------------------------------------ */
  /* ⏳  Auth loading splash                                           */
  /* ------------------------------------------------------------------ */
  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
          className="w-6 h-6 border border-gray-200 border-t-gray-900 rounded-full"
        />
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /* 📚 Learn More Content                                             */
  /* ------------------------------------------------------------------ */
  const LearnMoreContent = () => (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
        {/* Header */}
        <div className="text-center space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-medium text-gray-900"
          >
            Technology for understanding anything.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed"
          >
            ConsentLens is an AI-powered platform that makes complex legal documents human-readable. We analyze Terms of
            Service and Privacy Policies to help you understand your rights and risks.
          </motion.p>
        </div>

        {/* Features Grid - Compact */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <Brain className="w-8 h-8 text-blue-600" />,
              title: "AI-Powered Analysis",
              description:
                "Advanced language models analyze complex legal documents and extract key insights in seconds.",
            },
            {
              icon: <Shield className="w-8 h-8 text-emerald-600" />,
              title: "Privacy Compliance",
              description: "Check compliance with GDPR, CCPA, and other major privacy regulations worldwide.",
            },
            {
              icon: <TrendingUp className="w-8 h-8 text-purple-600" />,
              title: "Risk Assessment",
              description: "Get detailed risk scores and actionable recommendations to protect your privacy rights.",
            },
          ].map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.2 }}
              className="text-center space-y-4 p-6 bg-white rounded-2xl border border-gray-200 shadow-sm"
            >
              <div className="flex justify-center mb-4">{feature.icon}</div>
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-900">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Button
            onClick={() => setViewMode("home")}
            className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 text-lg rounded-full"
          >
            Start Analyzing
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </motion.div>
    </div>
  )

  const examplePrompts = [
    "Analyze the privacy policy of a social media platform: Instagram",
    "Check GDPR compliance for an e-commerce website: Amazon",
    "Review terms of service for a mobile app: Whatsapp",
    "Evaluate data sharing practices in a SaaS agreement"
  ]

  /* ------------------------------------------------------------------ */
  /* 🖥️  UI                                                            */
  /* ------------------------------------------------------------------ */
  console.log('RENDER:', { viewMode, analysisResult, documentText });

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Navigation bar */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center">
              <Image src="/favicon.png" alt="ConsentLens Icon" width={28} height={28} className="mr-2 rounded-full" />
              <h1 className="text-xl font-medium text-gray-900">consentlens</h1>
            </motion.div>

            {/* Desktop items */}
            <div className="hidden md:flex items-center space-x-8">
              <Button
                variant="ghost"
                onClick={() => setViewMode("learn")}
                className="text-gray-600 hover:text-gray-900"
              >
                RESEARCH
              </Button>
              <Button variant="ghost" onClick={() => setViewMode("home")} className="text-gray-600 hover:text-gray-900">
                PRODUCT
              </Button>
              {user && (
                <Button
                  variant="ghost"
                  onClick={() => setViewMode("profile")}
                  className="text-gray-600 hover:text-gray-900"
                >
                  PROFILE
                </Button>
              )}
              {user ? (
                <Button
                  variant="outline"
                  onClick={() => setViewMode("profile")}
                  className="rounded-full border-gray-300"
                >
                  Dashboard
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setAuthMode("signup")
                    setAuthModalOpen(true)
                  }}
                  className="bg-gray-900 hover:bg-gray-800 text-white rounded-full px-6"
                >
                  Get Started
                </Button>
              )}
            </div>

            {/* Mobile menu button */}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen((v) => !v)}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-gray-100 bg-white"
            >
              <div className="px-6 py-4 space-y-2">
                <Button variant="ghost" onClick={() => setViewMode("learn")} className="w-full justify-start">
                  RESEARCH
                </Button>
                <Button variant="ghost" onClick={() => setViewMode("home")} className="w-full justify-start">
                  PRODUCT
                </Button>
                {user && (
                  <Button variant="ghost" onClick={() => setViewMode("profile")} className="w-full justify-start">
                    PROFILE
                  </Button>
                )}
                {user ? (
                  <Button variant="outline" onClick={() => setViewMode("profile")} className="w-full">
                    Dashboard
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setAuthMode("signup")
                      setAuthModalOpen(true)
                    }}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    Get Started
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* MAIN VIEW */}
      <div className="flex-grow">
        {viewMode === "profile" && user ? (
          <UserProfile onNavigateHome={() => {
            setViewMode("home");
            setAnalysisResult(null);
            setDocumentText("");
          }} />
        ) : viewMode === "learn" ? (
          <LearnMoreContent />
        ) : viewMode === "chat" && analysisResult && documentText ? (
          <ChatInterface
            key={`${JSON.stringify(analysisResult)}-${documentText.length}`}
            analysisResult={analysisResult}
            originalContent={documentText}
            onBack={() => setViewMode("results")}
          />
        ) : viewMode === "results" && analysisResult && documentText ? (
          <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
            {/* Results Header */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-3xl font-medium text-gray-900">Analysis Complete</h2>
              <p className="text-gray-600">Here's what we found in your document</p>
            </div>
            {/* Score Card */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl p-8 text-center">
              <div className="space-y-4">
                <h3 className="text-xl font-medium text-gray-900">Compliance Score</h3>
                <div className="flex items-center justify-center space-x-4">
                  <div className="text-5xl font-bold text-gray-900">{analysisResult.complianceScore}%</div>
                  <Badge className={`text-sm ${getSeverityColor(analysisResult.riskLevel)}`}>{analysisResult.riskLevel.toUpperCase()} RISK</Badge>
                </div>
                <Progress value={analysisResult.complianceScore} className="w-full max-w-md mx-auto h-3" />
                <p className="text-gray-600">Based on {selectedRegion.toUpperCase()} standards</p>
              </div>
            </div>
            {/* Action Buttons */}
            <div className="flex flex-wrap justify-center gap-4">
              <Button onClick={handleCopyToClipboard} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-3 rounded-full">
                {copiedToClipboard ? (<><Check className="w-4 h-4 mr-2 text-emerald-600" />Copied!</>) : (<><Copy className="w-4 h-4 mr-2" />Copy Summary</>)}
              </Button>
              <Button onClick={handleDownloadReport} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-3 rounded-full">
                <Download className="w-4 h-4 mr-2" />Download Report
              </Button>
              <Button onClick={() => setViewMode("chat")} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full">
                <MessageCircle className="w-4 h-4 mr-2" />Chat with Policy
              </Button>
              <Button onClick={() => {
                setViewMode("home");
                setAnalysisResult(null);
                setDocumentText("");
              }} className="bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 px-6 py-3 rounded-full">
                Home
              </Button>
            </div>
            {/* Key Points */}
            <div className="bg-white rounded-3xl border border-gray-200 p-8">
              <h3 className="text-2xl font-medium text-gray-900 mb-6">Key Findings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {analysisResult.keyPoints.map((point, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 bg-blue-600 rounded-full" />
                    </div>
                    <p className="text-gray-700 leading-relaxed">{point}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Recommendations */}
            <div className="bg-white rounded-3xl border border-gray-200 p-8">
              <h3 className="text-2xl font-medium text-gray-900 mb-6">Recommendations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {analysisResult.recommendations.map((rec, idx) => (
                  <div key={idx} className={`p-6 rounded-2xl border ${getSeverityColor(rec.severity)}`}>
                    <div className="flex items-start space-x-3">
                      <div className="mt-1">{getCategoryIcon(rec.category)}</div>
                      <div className="space-y-2">
                        <h4 className="font-medium">{rec.title}</h4>
                        <p className="text-sm opacity-80 leading-relaxed">{rec.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Hero Section - Compact design */}
            <div ref={heroRef} className="relative overflow-hidden">
              <motion.div style={{ y: heroY, opacity: heroOpacity }} className="text-center py-12 px-6">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.6 }}
                  className="max-w-4xl mx-auto space-y-6 relative z-10"
                >
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-4xl md:text-5xl font-medium text-gray-900 leading-tight"
                  >
                    What do you want to understand?
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-lg text-gray-600 max-w-2xl mx-auto"
                  >
                    Start analyzing with a simple conversation.
                  </motion.p>

                  {/* User Stats Badge */}
                  {user && recentAnalyses > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="flex justify-center"
                    >
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 px-4 py-2">
                        <Star className="w-4 h-4 mr-2" />
                        {recentAnalyses} documents analyzed
                      </Badge>
                    </motion.div>
                  )}

                  {/* Main Input */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="max-w-3xl mx-auto"
                  >
                    <div className="relative">
                      <div className="bg-gray-900 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center space-x-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowAdvancedInput(!showAdvancedInput)}
                            className="text-gray-400 hover:text-white hover:bg-gray-800"
                          >
                            <Plus className="w-5 h-5" />
                          </Button>
                          <input
                            type="text"
                            placeholder="Describe what you want to analyze..."
                            value={conversationInput}
                            onChange={(e) => setConversationInput(e.target.value)}
                            className="flex-1 bg-transparent text-white placeholder-gray-400 text-lg outline-none"
                            onKeyPress={(e) => e.key === "Enter" && handleConversationAnalysis()}
                          />
                          <Button
                            onClick={handleConversationAnalysis}
                            disabled={!conversationInput.trim() || processingState === "processing"}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6"
                          >
                            {processingState === "processing" ? (
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                              />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Progress */}
                    <AnimatePresence>
                      {processingState === "processing" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4"
                        >
                          <Progress value={progress} className="w-full h-2" />
                          <p className="text-sm text-gray-500 mt-2 flex items-center justify-center">
                            <Clock className="w-4 h-4 mr-2" />
                            Analyzing your document... {progress}%
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* Example Prompts */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto"
                  >
                    {examplePrompts.map((prompt, idx) => (
                      <motion.button
                        key={idx}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + idx * 0.1 }}
                        onClick={() => setConversationInput(prompt)}
                        className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-full text-sm transition-colors"
                      >
                        {prompt}
                      </motion.button>
                    ))}
                  </motion.div>

                  {/* Advanced Input Toggle */}
                  <AnimatePresence>
                    {showAdvancedInput && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="max-w-3xl mx-auto"
                      >
                        <div className="bg-gray-50 rounded-2xl p-6 space-y-4">
                          <h3 className="text-lg font-medium text-gray-900">Advanced Analysis</h3>

                          {/* File Upload */}
                          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-gray-400 transition-colors">
                            <input
                              type="file"
                              accept=".pdf,.docx,.txt"
                              onChange={handleFileUpload}
                              className="hidden"
                              id="file-upload-advanced"
                            />
                            <label htmlFor="file-upload-advanced" className="cursor-pointer space-y-3">
                              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                              <div>
                                <p className="text-gray-700">{uploadedFile ? uploadedFile.name : "Upload document"}</p>
                                <p className="text-sm text-gray-500">PDF, DOCX, or TXT files</p>
                              </div>
                            </label>
                          </div>

                          <div className="text-center text-gray-500">or</div>

                          <Textarea
                            placeholder="Paste your Terms of Service or Privacy Policy text here..."
                            value={documentText}
                            onChange={(e) => setDocumentText(e.target.value)}
                            className="min-h-[120px] resize-none border-gray-300"
                          />

                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-gray-700">Law Region</label>
                              <Select value={selectedRegion} onValueChange={(v: LawRegion) => setSelectedRegion(v)}>
                                <SelectTrigger className="w-48">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="gdpr">GDPR (EU)</SelectItem>
                                  <SelectItem value="ccpa">CCPA (California)</SelectItem>
                                  <SelectItem value="dpdpa">DPDPA (India)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <Button
                              onClick={handleSummarize}
                              disabled={(!documentText && !uploadedFile) || processingState === "processing"}
                              className="bg-gray-900 hover:bg-gray-800 text-white px-6"
                            >
                              Analyze Document
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            </div>
          </>
        )}
      </div>

      {/* AUTH MODAL */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode={authMode} />

      {/* Footer - Simple and Clean */}
      {(viewMode === "home" || viewMode === "learn") && (
        <Footer
          onNavigateToLearn={() => setViewMode("learn")}
          onNavigateToHome={() => {
            setViewMode("home");
            setAnalysisResult(null);
            setDocumentText("");
          }}
          onNavigateToProfile={user ? () => setViewMode("profile") : undefined}
          onOpenAuth={(mode) => {
            setAuthMode(mode)
            setAuthModalOpen(true)
          }}
        />
      )}
    </div>
  )
}
