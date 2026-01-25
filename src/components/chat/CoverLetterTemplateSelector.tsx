import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check, FileText, Sparkles, Briefcase } from "lucide-react";

export type CoverLetterTemplate = "formal" | "creative" | "modern";

interface TemplateOption {
  id: CoverLetterTemplate;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  preview: string;
  style: {
    tone: string;
    structure: string;
  };
}

const templates: TemplateOption[] = [
  {
    id: "formal",
    name: "Formal",
    description: "Traditional business style, perfect for corporate roles",
    icon: Briefcase,
    preview: `Dear Hiring Manager,

I am writing to express my strong interest in the [Position] role at [Company]. With [X years] of experience in [field], I am confident in my ability to contribute meaningfully to your team.

Throughout my career, I have demonstrated expertise in [key skills], consistently delivering results that exceed expectations. In my current role at [Company], I [specific achievement with metrics].

I am particularly drawn to [Company] because of [specific company attribute]. My background in [relevant experience] aligns perfectly with your requirements for [job requirements].

I would welcome the opportunity to discuss how my qualifications can benefit your organization.

Sincerely,
[Your Name]`,
    style: {
      tone: "Professional and traditional",
      structure: "Classic paragraph format with formal salutations",
    },
  },
  {
    id: "creative",
    name: "Creative",
    description: "Engaging and unique, ideal for creative industries",
    icon: Sparkles,
    preview: `What if I told you that your next [Position] is reading this right now?

Hi [Hiring Manager],

I've spent the last [X years] turning impossible briefs into award-winning work. At [Company], I led a campaign that [specific achievement] — and honestly? I'm just getting started.

Here's what I bring to the table:
• [Key skill] that drove [result]
• [Key skill] that transformed [outcome]
• An obsession with [relevant passion]

[Company]'s approach to [specific initiative] caught my attention because [personal connection]. I'd love to bring my energy and expertise to help you push boundaries even further.

Let's create something remarkable together.

Cheers,
[Your Name]`,
    style: {
      tone: "Conversational and bold",
      structure: "Dynamic format with bullet points and engaging hooks",
    },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Clean and direct, great for tech and startups",
    icon: FileText,
    preview: `Hi [Hiring Manager],

I'm excited about the [Position] opportunity at [Company]. Your work on [specific project/product] aligns perfectly with my experience building [relevant work].

**What I bring:**
Over [X years], I've focused on [core competency]. Most recently, I [key achievement with impact].

**Why [Company]:**
[Company]'s mission to [company mission] resonates with me. I'm particularly impressed by [specific accomplishment or value].

**Next steps:**
I'd love to discuss how my skills in [key areas] can contribute to your team's goals.

Best,
[Your Name]`,
    style: {
      tone: "Direct and confident",
      structure: "Scannable format with bold headers and concise sections",
    },
  },
];

interface CoverLetterTemplateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTemplate: CoverLetterTemplate;
  onSelect: (template: CoverLetterTemplate) => void;
}

export function CoverLetterTemplateSelector({
  open,
  onOpenChange,
  selectedTemplate,
  onSelect,
}: CoverLetterTemplateSelectorProps) {
  const [previewTemplate, setPreviewTemplate] = useState<CoverLetterTemplate>(selectedTemplate);

  const handleConfirm = () => {
    onSelect(previewTemplate);
    onOpenChange(false);
  };

  const currentTemplate = templates.find((t) => t.id === previewTemplate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose a Cover Letter Style</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Template Options */}
          <div className="w-1/3 space-y-3">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => setPreviewTemplate(template.id)}
                className={`w-full flex items-start gap-3 p-4 rounded-lg border transition-all text-left ${
                  previewTemplate === template.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-accent/50"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    previewTemplate === template.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <template.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{template.name}</p>
                    {selectedTemplate === template.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Preview Panel */}
          <div className="flex-1 flex flex-col border rounded-lg overflow-hidden">
            <div className="p-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{currentTemplate?.name} Preview</h3>
                <div className="text-xs text-muted-foreground">
                  {currentTemplate?.style.tone}
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1 p-4">
              <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                {currentTemplate?.preview}
              </pre>
            </ScrollArea>
            <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground">
              <strong>Structure:</strong> {currentTemplate?.style.structure}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Use {currentTemplate?.name} Style
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function getTemplatePrompt(template: CoverLetterTemplate): string {
  switch (template) {
    case "formal":
      return `Write in a FORMAL, TRADITIONAL style:
- Use conventional business letter format
- Begin with "Dear Hiring Manager" or similar formal salutation
- Use proper paragraph structure (intro, body, conclusion)
- Maintain professional, respectful tone throughout
- End with "Sincerely" or "Best regards"
- Avoid contractions and casual language`;
    case "creative":
      return `Write in a CREATIVE, ENGAGING style:
- Open with a hook or attention-grabbing statement
- Use a conversational, personable tone
- Include bullet points for key achievements
- Show personality and passion
- Use dynamic language and vivid descriptions
- End with an energetic call-to-action`;
    case "modern":
      return `Write in a MODERN, DIRECT style:
- Use a concise, scannable format
- Include bold section headers (What I bring, Why [Company], Next steps)
- Be confident and straightforward
- Focus on value proposition upfront
- Use short paragraphs and bullet points
- End with a clear next step`;
    default:
      return "";
  }
}
