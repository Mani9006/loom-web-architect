import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, History, Loader2 } from "lucide-react";
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
              if (delta) {
                content += delta;
                setResult(content);
              }
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

  return (
    <div className="flex h-full">
      {/* Left - Form */}
      <div className="w-[500px] border-r border-border overflow-y-auto p-6 space-y-5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">AI Cover Letter Generator</h1>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/chat")}>
            <History className="w-4 h-4" /> View History
          </Button>
        </div>

        <div>
          <Label>Job Description*</Label>
          <Textarea
            placeholder="Enter Job Description"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            className="mt-1 min-h-[120px]"
          />
        </div>

        <div>
          <Label>Job Title*</Label>
          <Input placeholder="Enter Job Title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1" />
        </div>

        <div>
          <Label>Company Name</Label>
          <Input placeholder="Enter Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1" />
        </div>

        <div>
          <Label>Your Profile*</Label>
          <Textarea
            placeholder="Paste your resume text here..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="mt-1 min-h-[100px]"
          />
        </div>

        <Button onClick={generate} disabled={loading || !jobDescription.trim()} className="w-full gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate
        </Button>
      </div>

      {/* Right - Result */}
      <div className="flex-1 p-6 overflow-y-auto">
        <Card className="border-dashed h-full">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Result</h2>
            </div>
            {result ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{result}</div>
            ) : (
              <p className="text-muted-foreground text-sm">Your AI generated content will show here</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
