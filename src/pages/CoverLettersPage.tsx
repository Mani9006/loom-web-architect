import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, History, Loader2, Copy, Check, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CoverLettersPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!jobDescription.trim()) {
      toast({ title: "Required", description: "Please enter a job description", variant: "destructive" });
      return;
    }

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
              {
                role: "user",
                content: `Generate a professional cover letter for this position:\n\nJob Title: ${jobTitle}\nCompany: ${companyName}\nJob Description: ${jobDescription}\n\n${resumeText ? `My Resume:\n${resumeText}` : ""}`,
              },
            ],
            mode: "cover-letter",
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to generate");

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
      toast({ title: "Error", description: "Failed to generate cover letter", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyResult = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full">
      {/* Left - Form */}
      <div className="w-[500px] border-r border-border overflow-y-auto p-6 space-y-5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-accent" />
            <h1 className="text-lg font-bold">AI Cover Letter</h1>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/chat")}>
            <History className="w-4 h-4" /> History
          </Button>
        </div>

        <div>
          <Label>Job Description *</Label>
          <Textarea
            placeholder="Paste the full job description here..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            className="mt-1 min-h-[120px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Job Title *</Label>
            <Input placeholder="e.g. Software Engineer" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Company</Label>
            <Input placeholder="e.g. Google" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div>
          <Label>Your Profile *</Label>
          <Textarea
            placeholder="Paste your resume or describe your experience..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="mt-1 min-h-[100px]"
          />
        </div>

        <Button onClick={generate} disabled={loading || !jobDescription.trim()} className="w-full gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Cover Letter
        </Button>
      </div>

      {/* Right - Result */}
      <div className="flex-1 p-6 overflow-y-auto">
        <Card className="border-dashed h-full">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Generated Letter</h2>
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
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Mail className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Your AI-generated cover letter will appear here</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Fill in the form and click generate</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
