import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, Plus, FileText, Sparkles, Copy, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Resume {
  id: string;
  title: string;
  score: number;
  updatedAt: string;
}

export default function ResumeBuilder() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"base" | "tailored">("base");
  const [search, setSearch] = useState("");
  const [resumes, setResumes] = useState<Resume[]>([]);

  useEffect(() => {
    // Load conversations that were resume-related as "resumes"
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .in("chat_mode", ["resume-chat", "resume-form"])
        .order("updated_at", { ascending: false });

      if (data) {
        setResumes(
          data.map((c) => ({
            id: c.id,
            title: c.title || "Untitled Resume",
            score: Math.floor(Math.random() * 40) + 50, // Placeholder score
            updatedAt: c.updated_at,
          }))
        );
      }
    };
    load();
  }, []);

  const filtered = resumes.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">All Resumes</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Filter
          </Button>
          <Button size="sm" className="gap-2" onClick={() => navigate("/chat")}>
            <Plus className="w-4 h-4" /> Create New Resume
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        {[
          { key: "base" as const, label: "Base Resumes" },
          { key: "tailored" as const, label: "Job Tailored Resumes" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "pb-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Resume Cards Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No resumes yet</p>
          <p className="text-sm">Create your first resume to get started</p>
          <Button className="mt-4 gap-2" onClick={() => navigate("/chat")}>
            <Plus className="w-4 h-4" /> Create Resume
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((resume) => (
            <Card
              key={resume.id}
              className="overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
              onClick={() => navigate(`/c/${resume.id}`)}
            >
              {/* Preview Placeholder */}
              <div className="relative h-48 bg-muted/50 border-b flex items-center justify-center">
                <FileText className="w-16 h-16 text-muted-foreground/20" />
                {/* Score Badge */}
                <div
                  className={cn(
                    "absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground",
                    resume.score >= 70 ? "bg-primary" : resume.score >= 50 ? "bg-destructive/70" : "bg-destructive"
                  )}
                >
                  {resume.score}%
                </div>
              </div>

              <CardContent className="p-4">
                <h3 className="font-semibold text-sm truncate">{resume.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last edited {formatDistanceToNow(new Date(resume.updatedAt), { addSuffix: true })}
                </p>
                <div className="flex items-center gap-1 mt-3 flex-wrap">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                    <Sparkles className="w-3 h-3" /> Tailor for job
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <Copy className="w-3 h-3" /> Clone
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive">
                    <Trash2 className="w-3 h-3" /> Delete
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <Star className="w-3 h-3" /> Set as default
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
