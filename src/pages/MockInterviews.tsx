import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Monitor, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "All Scenario", "Technical", "Behavioral", "Negotiations", "Screening",
  "Situational", "Case Studies", "Leadership", "Cultural Fit", "Career Dev",
];

const SCENARIOS = [
  { title: "Software Engineering (Full Stack Developer)", desc: "Candidate is applying for a Senior Full Stack Developer role at a fintech startup building...", duration: "45 Mins", category: "Technical" },
  { title: "Frontend Engineer", desc: "Candidate is applying for a Frontend Engineer position at an e-commerce platform with...", duration: "40 Mins", category: "Technical" },
  { title: "Backend Engineer", desc: "Candidate is applying for a Backend Engineer role at a high-traffic social media platform...", duration: "45 Mins", category: "Technical" },
  { title: "DevOps Engineer", desc: "Candidate is applying for a DevOps Engineer position at a SaaS company experiencing...", duration: "25 Mins", category: "Technical" },
  { title: "AI/ML Engineer", desc: "Candidate is applying for an AI/ML Engineer role at a company building recommendation...", duration: "25 Mins", category: "Technical" },
  { title: "Data Scientist", desc: "Candidate is applying for a Data Scientist position at a company focused on analytics...", duration: "25 Mins", category: "Technical" },
  { title: "Data Analyst", desc: "Candidate is applying for a Data Analyst role at an e-commerce company that needs help...", duration: "25 Mins", category: "Behavioral" },
  { title: "Data Engineer", desc: "Candidate is applying for a Data Engineer position at a company with large-scale data...", duration: "25 Mins", category: "Technical" },
  { title: "Mobile Developer (iOS/Android)", desc: "Candidate is applying for a Mobile Developer role at a company building consumer-facing...", duration: "25 Mins", category: "Technical" },
  { title: "QA/Test Engineer", desc: "Candidate is applying for a QA Engineer position at a software company that needs to...", duration: "25 Mins", category: "Technical" },
  { title: "Security Engineer/Cybersecurity", desc: "Candidate is applying for a Security Engineer role at a company handling sensitive data an...", duration: "25 Mins", category: "Screening" },
  { title: "Cloud Architect", desc: "Candidate is applying for a Cloud Architect position at a company migrating to or...", duration: "25 Mins", category: "Technical" },
  { title: "Product Manager", desc: "Candidate is applying for a Product Manager role at a tech company building software...", duration: "25 Mins", category: "Behavioral" },
  { title: "Project Manager", desc: "Candidate is applying for a Project Manager position at a company executing complex...", duration: "25 Mins", category: "Leadership" },
  { title: "Business Analyst", desc: "Candidate is applying for a Business Analyst role at a company undergoing digital...", duration: "25 Mins", category: "Behavioral" },
  { title: "UX/UI Designer", desc: "Candidate is applying for a UX/UI Designer position at a company focused on creating...", duration: "25 Mins", category: "Behavioral" },
];

export default function MockInterviews() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("All Scenario");
  const [search, setSearch] = useState("");

  const filtered = SCENARIOS.filter((s) => {
    const matchCategory = selectedCategory === "All Scenario" || s.category === selectedCategory;
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const startInterview = (title: string) => {
    // Navigate to chat with interview prep mode
    navigate("/chat");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mock Interview</h1>
        <Button className="gap-2" onClick={() => navigate("/chat")}>
          <Sparkles className="w-4 h-4" /> Start Mock Interview
        </Button>
      </div>

      {/* Subtitle */}
      <div>
        <h2 className="text-lg font-semibold">Practice Scenarios</h2>
        <p className="text-sm text-muted-foreground">
          Explore real-world interview challenges, designed to help you sharpen your skills & build confidence.
        </p>
      </div>

      {/* Category Tabs + Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
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
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-48"
          />
        </div>
      </div>

      {/* Scenario Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((scenario) => (
          <Card
            key={scenario.title}
            className="hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => startInterview(scenario.title)}
          >
            <CardContent className="p-5">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                <Monitor className="w-4 h-4 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm leading-tight mb-2">{scenario.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{scenario.desc}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {scenario.duration}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
