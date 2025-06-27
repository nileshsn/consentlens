"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Settings, FileText, BarChart3, Crown, LogOut, TrendingUp, Clock, Shield, Plus, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"

interface UserStats {
  documentsAnalyzed: number
  averageComplianceScore: number
  totalRecommendations: number
}

interface RecentDocument {
  id: string
  title: string
  created_at: string
  law_region: string
  compliance_score?: number
}

interface UserProfileProps {
  onNavigateHome?: () => void
}

export function UserProfile({ onNavigateHome }: UserProfileProps) {
  const { user, signOut } = useAuth()
  const [stats, setStats] = useState<UserStats>({
    documentsAnalyzed: 0,
    averageComplianceScore: 0,
    totalRecommendations: 0,
  })
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState<string | null>(null)
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || "")
  const [saveStatus, setSaveStatus] = useState<null | "success" | "error">(null)
  const [saving, setSaving] = useState(false)
  const fullNameInputRef = useRef<HTMLInputElement>(null)
  const [retention, setRetention] = useState<string>("")
  const [retentionStatus, setRetentionStatus] = useState<null | "success" | "error">(null)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState<null | "success" | "error">(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const router = useRouter();

  useEffect(() => {
    if (user) {
      fetchUserStats()
      fetchRecentDocuments()
      setFullName(user.user_metadata?.full_name || "")
      fetchRetention()
    }
  }, [user])

  const fetchUserStats = async () => {
    try {
      // Get the user's documents (ids + count)
      const { count: docsCount, error: docsCountError } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)

      if (docsCountError) throw docsCountError

      // Fetch the document ids so we can query analysis_results
      const { data: docs, error: docsError } = await supabase.from("documents").select("id").eq("user_id", user!.id)

      if (docsError) throw docsError

      const docIds = docs?.map((d) => d.id) ?? []

      // Get analysis results for those documents
      let analyses: { compliance_score: number; recommendations: any[] }[] = []

      if (docIds.length > 0) {
        const { data: analysesData, error: analysesError } = await supabase
          .from("analysis_results")
          .select("compliance_score, recommendations")
          .in("document_id", docIds)

        if (analysesError) throw analysesError
        analyses = analysesData ?? []
      }

      const avgScore =
        analyses.length > 0 ? Math.round(analyses.reduce((sum, a) => sum + a.compliance_score, 0) / analyses.length) : 0

      const totalRecs = analyses.reduce(
        (sum, a) => sum + (Array.isArray(a.recommendations) ? a.recommendations.length : 0),
        0,
      )

      setStats({
        documentsAnalyzed: docsCount ?? 0,
        averageComplianceScore: avgScore,
        totalRecommendations: totalRecs,
      })
    } catch (error) {
      console.error("Error fetching user stats:", JSON.stringify(error, null, 2))
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentDocuments = async () => {
    try {
      const { data: docs, error } = await supabase
        .from("documents")
        .select(`
          id,
          title,
          created_at,
          law_region,
          analysis_results(compliance_score)
        `)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5)

      if (error) throw error

      const formattedDocs =
        docs?.map((doc: any) => ({
          id: doc.id,
          title: doc.title,
          created_at: doc.created_at,
          law_region: doc.law_region,
          compliance_score: doc.analysis_results?.[0]?.compliance_score,
        })) || []

      setRecentDocuments(formattedDocs)
    } catch (error) {
      console.error("Error fetching recent documents:", JSON.stringify(error, null, 2))
    }
  }

  const fetchRetention = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("user_profiles").select("data_retention_days").eq("id", user.id).single();
    if (!error && data && data.data_retention_days) {
      setRetention(data.data_retention_days.toString());
    } else {
      setRetention("");
    }
  }

  const handleSaveRetention = async () => {
    setRetentionStatus(null);
    if (!user) return;
    try {
      const { error } = await supabase.from("user_profiles").update({ data_retention_days: retention }).eq("id", user.id);
      if (error) throw error;
      setRetentionStatus("success");
    } catch {
      setRetentionStatus("error");
    }
  }

  const handleExportData = async () => {
    setExporting(true);
    if (!user) return;
    try {
      // Fetch documents
      const { data: docs, error: docsError } = await supabase.from("documents").select("*", { count: "exact" }).eq("user_id", user.id);
      if (docsError) throw docsError;
      // Fetch analysis results
      const docIds = docs?.map((d: any) => d.id) ?? [];
      let analyses: any[] = [];
      if (docIds.length > 0) {
        const { data: analysesData, error: analysesError } = await supabase.from("analysis_results").select("*").in("document_id", docIds);
        if (analysesError) throw analysesError;
        analyses = analysesData ?? [];
      }
      const exportObj = { documents: docs, analysis_results: analyses };
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `consentlens-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Optionally show error
    } finally {
      setExporting(false);
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteStatus(null);
    if (!user) return;
    try {
      // Delete analysis_results
      const { data: docs } = await supabase.from("documents").select("id").eq("user_id", user.id);
      const docIds = docs?.map((d: any) => d.id) ?? [];
      if (docIds.length > 0) {
        await supabase.from("analysis_results").delete().in("document_id", docIds);
      }
      // Delete documents
      await supabase.from("documents").delete().eq("user_id", user.id);
      // Delete user_profiles
      await supabase.from("user_profiles").delete().eq("id", user.id);
      // Delete user from auth
      await supabase.auth.admin.deleteUser(user.id);
      setDeleteStatus("success");
      setTimeout(() => {
        signOut();
        router.push("/");
      }, 1500);
    } catch {
      setDeleteStatus("error");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getRegionBadgeColor = (region: string) => {
    switch (region) {
      case "gdpr":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "ccpa":
        return "bg-green-100 text-green-800 border-green-200"
      case "dpdpa":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "analyze":
        if (onNavigateHome) {
          onNavigateHome()
        }
        break
      case "analytics":
        setShowSettings("analytics")
        break
      case "privacy":
        setShowSettings("privacy")
        break
      case "account":
        setShowSettings("account")
        break
      default:
        console.log(`Action ${action} not implemented yet`)
    }
  }

  const handleSaveAccount = async () => {
    setSaving(true)
    setSaveStatus(null)
    if (!user) {
      setSaveStatus("error")
      setSaving(false)
      return;
    }
    try {
      // Update user_profiles table
      const { error: profileError } = await supabase
        .from("user_profiles")
        .update({ full_name: fullName })
        .eq("id", user.id)
      if (profileError) throw profileError

      // Update auth metadata
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } })
      if (authError) throw authError

      setSaveStatus("success")
    } catch (err) {
      setSaveStatus("error")
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  // Settings panels
  if (showSettings) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center space-x-4 mb-8">
            <Button variant="outline" onClick={() => setShowSettings(null)}>
              ← Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">
              {showSettings === "analytics" && "Analytics"}
              {showSettings === "privacy" && "Privacy Settings"}
              {showSettings === "account" && "Account Settings"}
            </h1>
          </div>

          <Card className="bg-white border-gray-200 shadow-lg">
            <CardContent className="p-8">
              {showSettings === "analytics" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">Usage Analytics</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-6 bg-blue-50 rounded-lg">
                      <FileText className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-blue-900">{stats.documentsAnalyzed}</p>
                      <p className="text-sm text-blue-700">Total Documents</p>
                    </div>
                    <div className="text-center p-6 bg-emerald-50 rounded-lg">
                      <BarChart3 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-emerald-900">{stats.averageComplianceScore}%</p>
                      <p className="text-sm text-emerald-700">Avg. Score</p>
                    </div>
                    <div className="text-center p-6 bg-purple-50 rounded-lg">
                      <Settings className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-purple-900">{stats.totalRecommendations}</p>
                      <p className="text-sm text-purple-700">Recommendations</p>
                    </div>
                  </div>
                </div>
              )}

              {showSettings === "privacy" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">Privacy Settings</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <h3 className="font-medium text-gray-900">Data Retention</h3>
                        <p className="text-sm text-gray-600">Control how long we keep your analysis data</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <select
                          className="border border-gray-300 rounded px-2 py-1"
                          value={retention}
                          onChange={e => setRetention(e.target.value)}
                        >
                          <option value="">Select...</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                          <option value="365">365 days</option>
                          <option value="0">Forever</option>
                        </select>
                        <Button variant="outline" onClick={handleSaveRetention} disabled={!retention || retentionStatus === "success"}>
                          Save
                        </Button>
                      </div>
                      {retentionStatus === "success" && <span className="text-green-600 ml-4">Saved!</span>}
                      {retentionStatus === "error" && <span className="text-red-600 ml-4">Failed to save.</span>}
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <h3 className="font-medium text-gray-900">Export Data</h3>
                        <p className="text-sm text-gray-600">Download all your data in a portable format</p>
                      </div>
                      <Button variant="outline" onClick={handleExportData} disabled={exporting}>
                        {exporting ? "Exporting..." : "Export"}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <h3 className="font-medium text-gray-900">Delete Account</h3>
                        <p className="text-sm text-gray-600">Permanently delete your account and all data</p>
                      </div>
                      <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={deleting}>
                        {deleting ? "Deleting..." : "Delete"}
                      </Button>
                      {showDeleteConfirm && (
                        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
                          <div className="bg-white p-6 rounded shadow-lg max-w-sm w-full">
                            <h3 className="text-lg font-bold mb-2">Confirm Account Deletion</h3>
                            <p className="mb-4">Are you sure you want to permanently delete your account and all data? This action cannot be undone.</p>
                            <div className="flex justify-end space-x-2">
                              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                              <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleting}>
                                {deleting ? "Deleting..." : "Delete"}
                              </Button>
                            </div>
                            {deleteStatus === "success" && <p className="text-green-600 mt-2">Account deleted. Redirecting...</p>}
                            {deleteStatus === "error" && <p className="text-red-600 mt-2">Failed to delete account. Please try again.</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {showSettings === "account" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">Account Settings</h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          ref={fullNameInputRef}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          defaultValue={user.email || ""}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled
                        />
                      </div>
                    </div>
                    <div className="pt-4">
                      <Button onClick={handleSaveAccount} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
                        {saving ? "Saving..." : "Save Changes"}
                      </Button>
                      {saveStatus === "success" && (
                        <p className="text-green-600 mt-2">Changes saved successfully!</p>
                      )}
                      {saveStatus === "error" && (
                        <p className="text-red-600 mt-2">Failed to save changes. Please try again.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50/50 min-h-screen">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="md:flex md:items-center md:justify-between pb-8 border-b border-gray-200"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center">
              <Avatar className="h-12 w-12 sm:h-16 sm:w-16">
                <AvatarFallback className="bg-blue-600 text-white text-lg sm:text-2xl">
                  {user.user_metadata.full_name ? user.user_metadata.full_name.charAt(0).toUpperCase() : user.email!.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="ml-2 sm:ml-4">
                <h1 className="text-lg sm:text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                  {user.user_metadata.full_name || "Welcome Back"}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">{user.email}</p>
              </div>
            </div>
          </div>
          <div className="mt-2 md:mt-0 flex space-x-2 sm:space-x-3 items-center justify-end">
            <Button onClick={onNavigateHome} variant="outline" className="bg-white px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300">
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="hidden xs:inline">Back to Home</span>
            </Button>
            <Button onClick={signOut} variant="destructive" className="ml-0 sm:ml-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
              <LogOut className="w-4 h-4 mr-1" />
              <span className="hidden xs:inline">Logout</span>
            </Button>
          </div>
        </motion.div>

        {/* Dashboard Content */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Stats Overview */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="bg-white border-gray-200 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader>
                  <CardTitle className="text-gray-900 text-base sm:text-lg">Activity Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center">
                    <div className="p-2 sm:p-4 bg-gray-50 rounded-lg">
                      <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.documentsAnalyzed}</p>
                      <p className="text-xs sm:text-sm text-gray-500">Documents</p>
                    </div>
                    <div className="p-2 sm:p-4 bg-gray-50 rounded-lg">
                      <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.averageComplianceScore.toFixed(0)}%</p>
                      <p className="text-xs sm:text-sm text-gray-500">Avg. Score</p>
                    </div>
                    <div className="p-2 sm:p-4 bg-gray-50 rounded-lg">
                      <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.totalRecommendations}</p>
                      <p className="text-xs sm:text-sm text-gray-500">Recommendations</p>
                    </div>
                    <div className="p-2 sm:p-4 bg-gray-50 rounded-lg">
                      <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.documentsAnalyzed}</p>
                      <p className="text-xs sm:text-sm text-gray-500">Documents Analyzed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Recent Activity */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="bg-white border-gray-200 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader>
                  <CardTitle className="text-gray-900 text-base sm:text-lg">Recent Activity</CardTitle>
                  <CardDescription className="text-gray-600 text-xs sm:text-sm">Your latest analyzed documents</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                        className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full"
                      />
                    </div>
                  ) : recentDocuments.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto" />
                      <h3 className="mt-4 text-lg font-medium text-gray-900">No documents found</h3>
                      <p className="mt-1 text-sm text-gray-500">Start by analyzing a new document.</p>
                      <Button onClick={onNavigateHome} className="mt-6">
                        Analyze First Document
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recentDocuments.map((doc, idx) => (
                        <motion.div
                          key={doc.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.15 }}
                          className="flex items-center justify-between p-2 sm:p-4 bg-gray-50/50 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center space-x-4">
                            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${getRegionBadgeColor(doc.law_region)}`}>
                              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 truncate max-w-[120px] sm:max-w-xs text-xs sm:text-base">{doc.title}</p>
                              <p className="text-xs sm:text-sm text-gray-500">{formatDate(doc.created_at)}</p>
                            </div>
                          </div>
                          {doc.compliance_score && (
                            <div className="text-right">
                              <p className="text-xs sm:text-sm font-medium text-gray-900">{doc.compliance_score}%</p>
                              <p className="text-[10px] sm:text-xs text-gray-500">Score</p>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Side Column */}
          <div className="space-y-8">
            {/* Quick Actions */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="bg-white border-gray-200 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader>
                  <CardTitle className="text-gray-900 text-base sm:text-lg">Quick Actions</CardTitle>
                  <CardDescription className="text-gray-600 text-xs sm:text-sm">Common tasks and shortcuts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={() => handleQuickAction("analyze")}
                      className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Analyze New Document
                    </Button>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={() => handleQuickAction("analytics")}
                      variant="outline"
                      className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      View Analytics
                    </Button>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={() => handleQuickAction("privacy")}
                      variant="outline"
                      className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Privacy Settings
                    </Button>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={() => handleQuickAction("account")}
                      variant="outline"
                      className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Account Settings
                    </Button>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
