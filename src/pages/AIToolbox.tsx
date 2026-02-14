import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const AI_TOOLS = [
  { id: "personal-brand", label: "Personal Brand Statement", desc: "Craft a compelling personal brand statement" },
  { id: "email-writer", label: "Email Writer", desc: "Write professional emails for job applications" },
  { id: "elevator-pitch", label: "Elevator Pitch", desc: "Create a concise and impactful elevator pitch" },
  { id: "linkedin-headline", label: "LinkedIn Headline", desc: "Generate an attention-grabbing LinkedIn headline" },
  { id: "linkedin-about", label: "LinkedIn About", desc: "Write a compelling LinkedIn About section" },
  { id: "linkedin-post", label: "LinkedIn Post", desc: "Create engaging LinkedIn posts" },
];

export default function AIToolbox() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedTool, setSelectedTool] = useState(AI_TOOLS[0]);
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
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

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> AI Toolbox
        </h1>
        <p className="text-sm text-muted-foreground mt-1">AI-powered tools to supercharge your career</p>
      </div>

      {/* Tool Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {AI_TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => { setSelectedTool(tool); setResult(""); }}
            className={cn(
              "p-3 rounded-xl border text-left transition-all",
              selectedTool.id === tool.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30 hover:bg-muted/50"
            )}
          >
            <p className="text-sm font-medium">{tool.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tool.desc}</p>
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Generate {selectedTool.label}
          </Button>
        </div>

        <Card className="border-dashed">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Result</h3>
            </div>
            {result ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{result}</div>
            ) : (
              <p className="text-sm text-muted-foreground">Your AI generated content will show here</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
