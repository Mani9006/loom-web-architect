import { useState } from "react";
import { X, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES, type TemplateConfig } from "@/config/resume-templates";

// Color palette for template preview placeholders
const TEMPLATE_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  professional: { bg: "#f8f9fa", accent: "#000000", text: "#1a1a1a" },
  creative: { bg: "#faf5ff", accent: "#9333ea", text: "#1a1a1a" },
  modern: { bg: "#eff6ff", accent: "#2563eb", text: "#1e293b" },
  minimal: { bg: "#fafaf9", accent: "#57534e", text: "#292524" },
};

// Small placeholder preview for template cards
function TemplatePlaceholderPreview({ template }: { template: TemplateConfig }) {
  const colors = TEMPLATE_COLORS[template.id] || TEMPLATE_COLORS.professional;
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-start p-4 select-none"
      style={{ backgroundColor: colors.bg, fontFamily: template.layout.fontFamily }}
    >
      {/* Mini header */}
      <div className="w-full text-center mb-3">
        <div
          className="font-bold text-sm mb-0.5"
          style={{ color: colors.text, fontSize: "11px" }}
        >
          John Doe
        </div>
        <div style={{ color: colors.accent, fontSize: "8px", fontWeight: 600 }}>
          Software Engineer
        </div>
        <div style={{ fontSize: "6px", color: "#9ca3af", marginTop: "2px" }}>
          john@email.com | (555) 123-4567 | San Francisco, CA
        </div>
      </div>

      {/* Mini sections */}
      {template.sections
        .filter((s) => s.type !== "header")
        .slice(0, 4)
        .map((section) => (
          <div key={section.id} className="w-full mb-2">
            <div
              className="text-left mb-1"
              style={{
                fontSize: "7px",
                fontWeight: 700,
                color: colors.text,
                textTransform:
                  template.id === "minimal" ? "none" : "uppercase",
                fontVariant:
                  template.id === "minimal" ? "small-caps" : "normal",
                borderBottom:
                  template.id === "minimal"
                    ? "none"
                    : template.id === "modern"
                    ? `1px solid ${colors.accent}`
                    : `1px solid ${colors.text}`,
                paddingBottom: "1px",
                letterSpacing: "0.05em",
              }}
            >
              {section.name}
            </div>
            {/* Faux content lines */}
            <div className="space-y-0.5">
              <div
                className="rounded-sm"
                style={{
                  height: "3px",
                  width: "85%",
                  backgroundColor: `${colors.text}18`,
                }}
              />
              <div
                className="rounded-sm"
                style={{
                  height: "3px",
                  width: "70%",
                  backgroundColor: `${colors.text}10`,
                }}
              />
            </div>
          </div>
        ))}
    </div>
  );
}

// Convert TemplateConfig to the shape needed for the selector display
function getTemplateDisplayList() {
  return Object.values(TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    sections: t.sections
      .filter((s) => s.type !== "header")
      .map((s) => s.name),
    config: t,
  }));
}

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
  selectedTemplateId?: string;
}

type TemplateDisplay = ReturnType<typeof getTemplateDisplayList>[number];

export function TemplateSelector({ isOpen, onClose, onSelect, selectedTemplateId }: TemplateSelectorProps) {
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDisplay | null>(null);
  const templates = getTemplateDisplayList();

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
                &larr; Back to templates
              </Button>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Preview container */}
                <div className="flex-1 max-h-[70vh] overflow-auto rounded-lg border border-border shadow-lg bg-muted">
                  <div className="w-full" style={{ minHeight: "400px" }}>
                    <TemplatePlaceholderPreview template={previewTemplate.config} />
                  </div>
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
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                    <strong>Font:</strong> {previewTemplate.config.layout.fontFamily.split(",")[0].replace(/'/g, "")}
                    <br />
                    <strong>Line height:</strong> {previewTemplate.config.layout.lineHeight}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={cn(
                    "group relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg",
                    selectedTemplateId === template.id ? "border-primary" : "border-border"
                  )}
                >
                  <div className="aspect-[3/4] overflow-hidden bg-muted relative">
                    <TemplatePlaceholderPreview template={template.config} />
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
