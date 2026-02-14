import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MessageSquare, FileText, Clock, User, Mail, Phone, MapPin,
  ArrowRight, Sparkles, TrendingUp, ArrowLeft
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

const MODE_CONFIG: Record<string, { label: string; color: string }> = {
  general: { label: "General Chat", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  "ats-check": { label: "ATS Check", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  "cover-letter": { label: "Cover Letter", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  "interview-prep": { label: "Interview Prep", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  "job-search": { label: "Job Search", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
};

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
      if (!user) { navigate("/auth"); return; }
      setUserEmail(user.email || null);

      const [profileResult, conversationsResult, messagesResult, coverLettersResult] = await Promise.all([
        supabase.from("profiles").select("full_name, email, phone, location, avatar_url").eq("user_id", user.id).maybeSingle(),
        supabase.from("conversations").select("id, title, chat_mode, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("messages").select("id, conversation_id, created_at"),
        supabase.from("cover_letters").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
      ]);

      if (profileResult.data) setProfile(profileResult.data);

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

      const activities: RecentActivity[] = [
        ...conversations.slice(0, 5).map((conv) => ({
          id: conv.id, type: "conversation" as const,
          title: conv.title || "Untitled Conversation",
          timestamp: conv.updated_at, mode: conv.chat_mode,
        })),
        ...coverLetters.slice(0, 3).map((cl) => ({
          id: cl.id, type: "cover_letter" as const,
          title: cl.title, timestamp: cl.updated_at,
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

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64 lg:col-span-2" />
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Conversations", value: stats?.totalConversations || 0, icon: MessageSquare, sub: "Across all modes" },
    { label: "Messages", value: stats?.totalMessages || 0, icon: TrendingUp, sub: "Total interactions" },
    { label: "Cover Letters", value: stats?.totalCoverLetters || 0, icon: FileText, sub: "Created & saved" },
    { label: "Features Used", value: Object.keys(stats?.conversationsByMode || {}).length, icon: Sparkles, sub: "Different tools" },
  ];

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold">
            Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}! 👋
          </h2>
          <p className="text-muted-foreground">Here's your career toolkit overview</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((s) => (
            <Card key={s.label} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <s.icon className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="text-3xl font-bold">{s.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="w-4 h-4 text-primary" /> Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                    {getInitials(profile?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{profile?.full_name || "No name set"}</p>
                  <p className="text-sm text-muted-foreground">{userEmail}</p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                {profile?.email && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="truncate">{profile.email}</span>
                  </div>
                )}
                {profile?.phone && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{profile.phone}</span>
                  </div>
                )}
                {profile?.location && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{profile.location}</span>
                  </div>
                )}
              </div>

              <Button variant="outline" className="w-full gap-2" size="sm" onClick={() => navigate("/profile")}>
                Edit Profile <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="w-4 h-4 text-primary" /> Recent Activity
              </CardTitle>
              <CardDescription>Your latest conversations and cover letters</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No activity yet</p>
                  <p className="text-sm">Start a conversation to see your activity here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((activity) => (
                    <div
                      key={`${activity.type}-${activity.id}`}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group"
                      onClick={() => {
                        if (activity.type === "conversation") navigate(`/c/${activity.id}`);
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                          {activity.type === "conversation" ? (
                            <MessageSquare className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                          ) : (
                            <FileText className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      {activity.mode && MODE_CONFIG[activity.mode] && (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${MODE_CONFIG[activity.mode].color}`}>
                          {MODE_CONFIG[activity.mode].label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Feature Usage */}
        {stats && Object.keys(stats.conversationsByMode).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Usage by Feature</CardTitle>
              <CardDescription>How you've been using different tools</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {Object.entries(stats.conversationsByMode).map(([mode, count]) => {
                  const config = MODE_CONFIG[mode] || { label: mode, color: "bg-muted text-muted-foreground" };
                  return (
                    <div key={mode} className="text-center p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-2 ${config.color}`}>
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-xs text-muted-foreground font-medium">{config.label}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
