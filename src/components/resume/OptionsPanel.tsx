import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectOptionsData, SummaryOptionsData } from "./ResumeChatPanel";

interface OptionsPanelProps {
  projectOptions: ProjectOptionsData[];
  summaryOptions: SummaryOptionsData | null;
  onSelectProject: (clientId: string, optionId: string) => void;
  onSelectSummary: (optionId: string) => void;
}

export function OptionsPanel({
  projectOptions,
  summaryOptions,
  onSelectProject,
  onSelectSummary,
}: OptionsPanelProps) {
  const hasOptions = projectOptions.length > 0 || summaryOptions;

  if (!hasOptions) return null;

  return (
    <div className="bg-background p-4 space-y-4">
      {/* Summary Options */}
      {summaryOptions && summaryOptions.options.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Choose Professional Summary:</h4>
          <div className="grid grid-cols-1 gap-2">
            {summaryOptions.options.map((option, idx) => (
              <button
                key={option.id}
                onClick={() => onSelectSummary(option.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border text-xs transition-all",
                  option.isSelected
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50 hover:bg-accent/50"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="font-semibold text-foreground">Option {idx + 1}</span>
                    <p className="mt-1 text-muted-foreground line-clamp-3">{option.content}</p>
                  </div>
                  {option.isSelected && (
                    <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Project Options for each client */}
      {projectOptions.map((clientData) => (
        <div key={clientData.clientId} className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            Choose bullets for <span className="text-primary">{clientData.clientName}</span>
            <span className="text-muted-foreground font-normal"> ({clientData.role})</span>
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {clientData.options.map((option, idx) => (
              <button
                key={option.id}
                onClick={() => onSelectProject(clientData.clientId, option.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border text-xs transition-all",
                  option.isSelected
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50 hover:bg-accent/50"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="font-semibold text-foreground">{option.title || `Option ${idx + 1}`}</span>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5 text-muted-foreground">
                      {option.bullets.slice(0, 2).map((bullet, i) => (
                        <li key={i} className="line-clamp-1">{bullet}</li>
                      ))}
                      {option.bullets.length > 2 && (
                        <li className="italic">+{option.bullets.length - 2} more...</li>
                      )}
                    </ul>
                  </div>
                  {option.isSelected && (
                    <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
