import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MessageSquare, 
  FileText, 
  Clock, 
  User, 
  Mail, 
  Phone, 
  MapPin,
  ArrowRight,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Profile {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  avatar_url: string | null;
}

interface Stats {
  totalConversations: number;
  totalMessages: number;
  totalCoverLetters: number;
  conversationsByMode: Record<string, number>;
}

interface RecentActivity {
  id: string;
  type: "conversation" | "cover_letter";
  title: string;
  timestamp: string;
  mode?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      setUserEmail(user.email || null);

      // Fetch all data in parallel
      const [profileResult, conversationsResult, messagesResult, coverLettersResult] = await Promise.all([
        supabase.from("profiles").select("full_name, email, phone, location, avatar_url").eq("user_id", user.id).maybeSingle(),
        supabase.from("conversations").select("id, title, chat_mode, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("messages").select("id, conversation_id, created_at"),
        supabase.from("cover_letters").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
      ]);

      // Set profile
      if (profileResult.data) {
        setProfile(profileResult.data);
      }

      // Calculate stats
      const conversations = conversationsResult.data || [];
      const messages = messagesResult.data || [];
      const coverLetters = coverLettersResult.data || [];

      const conversationsByMode: Record<string, number> = {};
      conversations.forEach((conv) => {
        const mode = conv.chat_mode || "general";
        conversationsByMode[mode] = (conversationsByMode[mode] || 0) + 1;
      });

      setStats({
        totalConversations: conversations.length,
        totalMessages: messages.length,
        totalCoverLetters: coverLetters.length,
        conversationsByMode,
      });

      // Build recent activity
      const activities: RecentActivity[] = [
        ...conversations.slice(0, 5).map((conv) => ({
          id: conv.id,
          type: "conversation" as const,
          title: conv.title || "Untitled Conversation",
          timestamp: conv.updated_at,
          mode: conv.chat_mode,
        })),
        ...coverLetters.slice(0, 3).map((cl) => ({
          id: cl.id,
          type: "cover_letter" as const,
          title: cl.title,
          timestamp: cl.updated_at,
        })),
      ];

      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(activities.slice(0, 8));

      setLoading(false);
    };

    fetchDashboardData();
  }, [navigate]);

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getModeLabel = (mode: string) => {
    const labels: Record<string, string> = {
      general: "General Chat",
      "ats-check": "ATS Check",
      "cover-letter": "Cover Letter",
      "interview-prep": "Interview Prep",
      "job-search": "Job Search",
    };
    return labels[mode] || mode;
  };

  const getModeColor = (mode: string) => {
    const colors: Record<string, string> = {
      general: "bg-blue-500/10 text-blue-600",
      "ats-check": "bg-purple-500/10 text-purple-600",
      "cover-letter": "bg-green-500/10 text-green-600",
      "interview-prep": "bg-orange-500/10 text-orange-600",
      "job-search": "bg-pink-500/10 text-pink-600",
    };
    return colors[mode] || "bg-muted text-muted-foreground";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!</h1>
            <p className="text-muted-foreground">Here's an overview of your activity</p>
          </div>
          <Button onClick={() => navigate("/chat")} className="gap-2">
            <Sparkles className="w-4 h-4" />
            Start New Chat
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Conversations</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalConversations || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Across all chat modes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Messages Sent</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalMessages || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Total interactions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cover Letters</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalCoverLetters || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Created & saved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Chat Modes Used</CardTitle>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Object.keys(stats?.conversationsByMode || {}).length}</div>
              <p className="text-xs text-muted-foreground mt-1">Different features</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile
              </CardTitle>
              <CardDescription>Your account information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-lg bg-primary/10 text-primary">
                    {getInitials(profile?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-lg">{profile?.full_name || "No name set"}</p>
                  <p className="text-sm text-muted-foreground">{userEmail}</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {profile?.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{profile.email}</span>
                  </div>
                )}
                {profile?.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{profile.phone}</span>
                  </div>
                )}
                {profile?.location && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{profile.location}</span>
                  </div>
                )}
              </div>

              <Button variant="outline" className="w-full mt-4" onClick={() => navigate("/profile")}>
                Edit Profile
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>Your latest conversations and cover letters</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No activity yet</p>
                  <p className="text-sm">Start a conversation to see your activity here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div
                      key={`${activity.type}-${activity.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => {
                        if (activity.type === "conversation") {
                          navigate(`/c/${activity.id}`);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {activity.type === "conversation" ? (
                          <MessageSquare className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium text-sm line-clamp-1">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      {activity.mode && (
                        <span className={`text-xs px-2 py-1 rounded-full ${getModeColor(activity.mode)}`}>
                          {getModeLabel(activity.mode)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chat Mode Breakdown */}
        {stats && Object.keys(stats.conversationsByMode).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Usage by Feature</CardTitle>
              <CardDescription>How you've been using different chat modes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {Object.entries(stats.conversationsByMode).map(([mode, count]) => (
                  <div key={mode} className="text-center p-4 rounded-lg border">
                    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full mb-2 ${getModeColor(mode)}`}>
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{getModeLabel(mode)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
