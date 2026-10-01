import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Bug, Lightbulb, Heart, MessageSquare } from "lucide-react";

type Category = "bug" | "feature" | "praise" | "other";

const CATEGORIES: Array<{ value: Category; label: string; icon: React.ElementType; desc: string }> = [
  { value: "bug",     label: "Bug",     icon: Bug,           desc: "Something's broken or behaving oddly." },
  { value: "feature", label: "Feature", icon: Lightbulb,     desc: "An idea for what we should build." },
  { value: "praise",  label: "Praise",  icon: Heart,         desc: "Tell us what's working well." },
  { value: "other",   label: "Other",   icon: MessageSquare, desc: "Anything else on your mind." },
];

export default function FeedbackPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState<Category>("feature");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Add a subject and message");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("submit-feedback", {
        body: {
          category,
          subject: subject.trim(),
          message: message.trim(),
          page_url: typeof window !== "undefined" ? window.location.href : null,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
      if (error) throw error;
      toast.success("Thanks, we got it. We read every one.");
      setSubject("");
      setMessage("");
      setCategory("feature");
      setTimeout(() => navigate("/home"), 700);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes("401")
        ? "Please sign in to send feedback."
        : `Couldn't send: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-6 lg:px-10 pt-10 pb-16 max-w-[780px] mx-auto">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">Feedback</p>
      <h1 className="text-3xl sm:text-3xl font-bold text-foreground tracking-tight leading-tight">
        Tell us what's on your mind
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-[64ch] leading-relaxed">
        Bug, feature, kind words, all of it lands in our inbox. {user?.email ? `We'll reply to ${user.email}.` : ""}
      </p>

      <div className="mt-8 space-y-6">
        {/* Category picker */}
        <div>
          <label className="block text-meta font-semibold text-foreground mb-2">Category</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-colors",
                    active
                      ? "border-foreground/40 bg-foreground/[0.04]"
                      : "border-border hover:border-foreground/20 hover:bg-muted/50"
                  )}
                >
                  <Icon className={cn("w-4 h-4", active ? "text-foreground" : "text-muted-foreground")} strokeWidth={1.75} />
                  <div>
                    <div className="text-meta font-semibold text-foreground">{c.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{c.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="feedback-subject" className="block text-meta font-semibold text-foreground mb-2">Subject</label>
          <input
            id="feedback-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short one-liner"
            maxLength={200}
            className="w-full h-10 px-3 rounded-md bg-background border border-border text-meta focus:outline-none focus:border-foreground/40"
          />
        </div>

        <div>
          <label htmlFor="feedback-message" className="block text-meta font-semibold text-foreground mb-2">Message</label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happened, what you expected, and anything else useful."
            rows={7}
            maxLength={5000}
            className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-meta leading-relaxed focus:outline-none focus:border-foreground/40 resize-y"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            {message.length} / 5000 characters
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={submit}
            disabled={submitting}
            className="h-10 px-5 rounded-md text-meta font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send feedback"}
          </button>
          <button
            onClick={() => navigate(-1)}
            className="h-10 px-4 rounded-md text-meta text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
