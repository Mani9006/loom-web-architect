import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Send, Wand2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const AI_TOOLS = [
  { id: "personal-brand", label: "Personal Brand Statement", desc: "Craft a compelling personal brand statement that sets you apart", icon: "✨" },
  { id: "email-writer", label: "Professional Email Writer", desc: "Write polished emails for job applications and follow-ups", icon: "📧" },
  { id: "elevator-pitch", label: "Elevator Pitch", desc: "Create a 30-second pitch that makes people remember you", icon: "🎯" },
  { id: "linkedin-headline", label: "LinkedIn Headline", desc: "Generate headlines that attract recruiters and opportunities", icon: "💼" },
  { id: "linkedin-about", label: "LinkedIn About Section", desc: "Write a compelling story that showcases your career journey", icon: "📝" },
  { id: "linkedin-post", label: "LinkedIn Post Creator", desc: "Create engaging posts that build your professional brand", icon: "📣" },
];

export default function AIToolbox() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedTool, setSelectedTool] = useState(AI_TOOLS[0]);
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              { role: "user", content: `You are an expert career coach. Generate a ${selectedTool.label} based on the following input:\n\n${input}` },
            ],
            mode: "general",
            agentHint: "general",
          }),
        }
      );

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") continue;
            try {
              const parsed = JSON.parse(json);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) { content += delta; setResult(content); }
            } catch { break; }
          }
        }
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate content", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyResult = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Content copied to clipboard" });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-accent" /> AI Toolbox
        </h1>
        <p className="text-sm text-muted-foreground mt-1">6 AI-powered tools to supercharge your career brand</p>
      </div>

      {/* Tool Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {AI_TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => { setSelectedTool(tool); setResult(""); }}
            className={cn(
              "p-3 rounded-xl border text-left transition-all duration-200",
              selectedTool.id === tool.id
                ? "border-primary bg-primary/5 shadow-[var(--shadow-card-hover)]"
                : "border-border hover:border-primary/30 hover:bg-muted/50"
            )}
          >
            <span className="text-xl mb-1 block">{tool.icon}</span>
            <p className="text-xs font-semibold leading-tight">{tool.label}</p>
          </button>
        ))}
      </div>

      {/* Input + Result */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">{selectedTool.label}</Label>
            <p className="text-xs text-muted-foreground mb-2">{selectedTool.desc}</p>
            <Textarea
              placeholder="Enter your details, background, or context here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[200px]"
            />
          </div>
          <Button onClick={generate} disabled={loading || !input.trim()} className="w-full gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate {selectedTool.label}
          </Button>
        </div>

        <Card className="border-dashed">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Result</h3>
              </div>
              {result && (
                <Button variant="ghost" size="sm" onClick={copyResult} className="gap-1.5 text-xs h-7">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
            </div>
            {result ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{result}</div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Wand2 className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Your AI-generated content will appear here</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Select a tool, add context, and hit generate</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
