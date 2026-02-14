import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Monitor, Clock, Sparkles, Mic2, Brain, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "All", "Technical", "Behavioral", "Negotiations", "Screening",
  "Situational", "Case Studies", "Leadership", "Cultural Fit",
];

const SCENARIOS = [
  { title: "Software Engineering (Full Stack)", desc: "Senior Full Stack Developer at a fintech startup building payment systems", duration: "45 Min", category: "Technical", difficulty: "Hard" },
  { title: "Frontend Engineer", desc: "Frontend Engineer at an e-commerce platform with 10M+ users", duration: "40 Min", category: "Technical", difficulty: "Medium" },
  { title: "Backend Engineer", desc: "Backend Engineer at a high-traffic social media platform", duration: "45 Min", category: "Technical", difficulty: "Hard" },
  { title: "DevOps Engineer", desc: "DevOps Engineer at a SaaS company experiencing rapid growth", duration: "25 Min", category: "Technical", difficulty: "Medium" },
  { title: "AI/ML Engineer", desc: "AI/ML Engineer building recommendation systems", duration: "25 Min", category: "Technical", difficulty: "Hard" },
  { title: "Data Scientist", desc: "Data Scientist at a company focused on predictive analytics", duration: "25 Min", category: "Technical", difficulty: "Medium" },
  { title: "Data Analyst", desc: "Data Analyst at an e-commerce company needing insights", duration: "25 Min", category: "Behavioral", difficulty: "Easy" },
  { title: "Data Engineer", desc: "Data Engineer building large-scale data pipelines", duration: "25 Min", category: "Technical", difficulty: "Medium" },
  { title: "Mobile Developer", desc: "Mobile Developer building consumer-facing iOS/Android apps", duration: "25 Min", category: "Technical", difficulty: "Medium" },
  { title: "QA/Test Engineer", desc: "QA Engineer building comprehensive test automation", duration: "25 Min", category: "Technical", difficulty: "Easy" },
  { title: "Security Engineer", desc: "Security Engineer protecting sensitive data infrastructure", duration: "25 Min", category: "Screening", difficulty: "Hard" },
  { title: "Cloud Architect", desc: "Cloud Architect leading multi-cloud migration strategy", duration: "25 Min", category: "Technical", difficulty: "Hard" },
  { title: "Product Manager", desc: "Product Manager driving software product strategy", duration: "25 Min", category: "Behavioral", difficulty: "Medium" },
  { title: "Project Manager", desc: "Project Manager executing complex cross-team initiatives", duration: "25 Min", category: "Leadership", difficulty: "Medium" },
  { title: "Business Analyst", desc: "Business Analyst driving digital transformation", duration: "25 Min", category: "Behavioral", difficulty: "Easy" },
  { title: "UX/UI Designer", desc: "UX/UI Designer creating accessible, delightful experiences", duration: "25 Min", category: "Behavioral", difficulty: "Medium" },
];

export default function MockInterviews() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = SCENARIOS.filter((s) => {
    const matchCategory = selectedCategory === "All" || s.category === selectedCategory;
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Mic2 className="w-5 h-5 text-accent" /> Mock Interviews
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Practice with AI interviewers — voice-enabled, scored, and personalized
          </p>
        </div>
        <Button className="gap-2" onClick={() => navigate("/chat")}>
          <Sparkles className="w-4 h-4" /> Start Custom Interview
        </Button>
      </div>

      {/* Category Tabs + Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                selectedCategory === cat
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search scenarios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-48"
          />
        </div>
      </div>

      {/* Scenario Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((scenario) => (
          <Card
            key={scenario.title}
            className="hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 cursor-pointer group hover:border-primary/20"
            onClick={() => navigate("/chat")}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Monitor className="w-4 h-4 text-primary" />
                </div>
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  scenario.difficulty === "Hard" ? "bg-destructive/10 text-destructive" :
                  scenario.difficulty === "Medium" ? "bg-accent/10 text-accent" :
                  "bg-muted text-muted-foreground"
                )}>
                  {scenario.difficulty}
                </span>
              </div>
              <h3 className="font-semibold text-sm leading-tight mb-2">{scenario.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{scenario.desc}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {scenario.duration}
                </div>
                <Play className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
