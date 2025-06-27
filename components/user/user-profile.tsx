"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Settings, FileText, BarChart3, Crown, LogOut, TrendingUp, Clock, Shield, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

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

          <Card className="bg-white border-gray-200 shadow-sm">
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-1">Welcome back, {user.user_metadata?.full_name || "User"}!</p>
            </div>
            <Button variant="outline" onClick={signOut} className="border-gray-300 text-gray-700 hover:bg-gray-50">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {/* Profile Card */}
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Avatar className="w-16 h-16 border-2 border-gray-200">
                    <AvatarFallback className="bg-teal-500 text-white text-4xl font-bold flex items-center justify-center w-full h-full">
                      {user.user_metadata?.full_name?.charAt(0).toUpperCase()
                        || user.email?.charAt(0).toUpperCase()
                        || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-gray-900">{user.user_metadata?.full_name || "User"}</h2>
                    <p className="text-gray-600">{user.email}</p>
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                      <Crown className="w-3 h-3 mr-1" />
                      Free Plan
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Member since</p>
                  <p className="text-gray-900 font-medium">
                    {new Date(user.created_at).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Documents Analyzed</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.documentsAnalyzed}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Avg. Compliance Score</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.averageComplianceScore}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Settings className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Recommendations</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.totalRecommendations}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">Recent Activity</CardTitle>
                <CardDescription className="text-gray-600">Your latest document analyses</CardDescription>
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
                  <div className="text-center py-8 space-y-3">
                    <FileText className="w-12 h-12 mx-auto text-gray-400" />
                    <p className="text-gray-600 font-medium">No documents analyzed yet</p>
                    <p className="text-sm text-gray-500">Start by uploading your first Terms of Service document</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentDocuments.map((doc, idx) => (
                      <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 truncate max-w-xs">{doc.title}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge className={`text-xs ${getRegionBadgeColor(doc.law_region)}`}>
                                {doc.law_region.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-gray-500">{formatDate(doc.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        {doc.compliance_score && (
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">{doc.compliance_score}%</p>
                            <p className="text-xs text-gray-500">Score</p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">Quick Actions</CardTitle>
                <CardDescription className="text-gray-600">Common tasks and shortcuts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() => handleQuickAction("analyze")}
                  className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Analyze New Document
                </Button>
                <Button
                  onClick={() => handleQuickAction("analytics")}
                  variant="outline"
                  className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  View Analytics
                </Button>
                <Button
                  onClick={() => handleQuickAction("privacy")}
                  variant="outline"
                  className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Privacy Settings
                </Button>
                <Button
                  onClick={() => handleQuickAction("account")}
                  variant="outline"
                  className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Account Settings
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Usage Insights */}
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900">Usage Insights</CardTitle>
              <CardDescription className="text-gray-600">Your analysis patterns and trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Clock className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-900">2.3 min</p>
                  <p className="text-sm text-blue-700">Avg. Analysis Time</p>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-lg">
                  <Shield className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-emerald-900">GDPR</p>
                  <p className="text-sm text-emerald-700">Most Used Region</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <TrendingUp className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-purple-900">+15%</p>
                  <p className="text-sm text-purple-700">Score Improvement</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
