import { useState } from "react";
import { X, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResumeTemplate } from "@/types/resume";
import templateCreative from "@/assets/templates/template-creative.jpg";
import templateProfessional from "@/assets/templates/template-professional.jpg";

const templates: ResumeTemplate[] = [
  {
    id: "creative",
    name: "Creative",
    description: "Clean, modern layout perfect for tech and creative roles. Features sections for projects and side ventures.",
    preview: templateCreative,
    sections: ["Experience", "Projects", "Education", "Skills"],
  },
  {
    id: "professional",
    name: "Professional",
    description: "Comprehensive format ideal for senior roles. Includes summary, certifications, and detailed skill categories.",
    preview: templateProfessional,
    sections: ["Summary", "Experience", "Education", "Certifications", "Skills", "Projects"],
  },
];

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
  selectedTemplateId?: string;
}

export function TemplateSelector({ isOpen, onClose, onSelect, selectedTemplateId }: TemplateSelectorProps) {
  const [previewTemplate, setPreviewTemplate] = useState<ResumeTemplate | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">Choose a Template</h2>
            <p className="text-sm text-muted-foreground">Select a resume template to get started</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Template Grid */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(90vh - 80px)" }}>
          {previewTemplate ? (
            <div className="space-y-4">
              <Button variant="ghost" onClick={() => setPreviewTemplate(null)} className="gap-2">
                ← Back to templates
              </Button>
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1">
                  <img
                    src={previewTemplate.preview}
                    alt={previewTemplate.name}
                    className="w-full rounded-lg border border-border shadow-lg"
                  />
                </div>
                <div className="lg:w-80 space-y-4">
                  <h3 className="text-2xl font-bold">{previewTemplate.name}</h3>
                  <p className="text-muted-foreground">{previewTemplate.description}</p>
                  <div>
                    <h4 className="font-medium mb-2">Included Sections:</h4>
                    <ul className="space-y-1">
                      {previewTemplate.sections.map((section) => (
                        <li key={section} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="h-4 w-4 text-primary" />
                          {section}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    onClick={() => onSelect(previewTemplate.id)}
                    className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:opacity-90"
                  >
                    Use This Template
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={cn(
                    "group relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg",
                    selectedTemplateId === template.id ? "border-primary" : "border-border"
                  )}
                >
                  <div className="aspect-[3/4] overflow-hidden bg-muted">
                    <img
                      src={template.preview}
                      alt={template.name}
                      className="w-full h-full object-cover object-top transition-transform group-hover:scale-105"
                    />
                  </div>
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-20">
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewTemplate(template);
                        }}
                        className="gap-1"
                      >
                        <Eye className="h-4 w-4" /> Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(template.id);
                        }}
                        className="gap-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
                      >
                        <Check className="h-4 w-4" /> Select
                      </Button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{template.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1">{template.description}</p>
                      </div>
                      {selectedTemplateId === template.id && (
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
