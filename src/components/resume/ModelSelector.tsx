import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Sparkles, Zap } from "lucide-react";

export type AIModel = {
  id: string;
  name: string;
  provider: "gemini" | "openai" | "anthropic";
  description: string;
};

export const AI_MODELS: AIModel[] = [
  // Gemini models (via Lovable AI) - keep as is
  {
    id: "gemini-flash",
    name: "Gemini Flash",
    provider: "gemini",
    description: "Fast & efficient",
  },
  {
    id: "gemini-pro",
    name: "Gemini Pro",
    provider: "gemini",
    description: "Most capable Gemini",
  },
  // OpenAI models - prioritize less tokens/cheaper models
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast & affordable",
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "openai",
    description: "Fastest & cheapest",
  },
  // Anthropic Claude models - prioritize less tokens/cheaper models
  {
    id: "claude-haiku",
    name: "Claude Haiku",
    provider: "anthropic",
    description: "Fast & efficient",
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "anthropic",
    description: "Balanced & capable",
  },
];

const providerIcons = {
  gemini: Sparkles,
  openai: Brain,
  anthropic: Zap,
};

const providerColors = {
  gemini: "text-blue-500",
  openai: "text-green-500",
  anthropic: "text-orange-500",
};

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ModelSelector({ value, onChange, disabled, compact = false }: ModelSelectorProps) {
  const selectedModel = AI_MODELS.find((m) => m.id === value);
  const Icon = selectedModel ? providerIcons[selectedModel.provider] : Sparkles;

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={compact ? "h-8 w-auto gap-1 px-2 text-xs bg-secondary border-0" : "w-full sm:w-[200px] bg-background"}>
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${selectedModel ? providerColors[selectedModel.provider] : ""}`} />
          {!compact && <SelectValue placeholder="Select AI Model" />}
          {compact && <span className="text-xs">{selectedModel?.name || "Model"}</span>}
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover z-50">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Gemini (Lovable)</div>
        {AI_MODELS.filter((m) => m.provider === "gemini").map((model) => {
          const ModelIcon = providerIcons[model.provider];
          return (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2">
                <ModelIcon className={`h-4 w-4 ${providerColors[model.provider]}`} />
                <span>{model.name}</span>
                <span className="text-xs text-muted-foreground">• {model.description}</span>
              </div>
            </SelectItem>
          );
        })}
        
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">OpenAI</div>
        {AI_MODELS.filter((m) => m.provider === "openai").map((model) => {
          const ModelIcon = providerIcons[model.provider];
          return (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2">
                <ModelIcon className={`h-4 w-4 ${providerColors[model.provider]}`} />
                <span>{model.name}</span>
                <span className="text-xs text-muted-foreground">• {model.description}</span>
              </div>
            </SelectItem>
          );
        })}
        
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Claude</div>
        {AI_MODELS.filter((m) => m.provider === "anthropic").map((model) => {
          const ModelIcon = providerIcons[model.provider];
          return (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2">
                <ModelIcon className={`h-4 w-4 ${providerColors[model.provider]}`} />
                <span>{model.name}</span>
                <span className="text-xs text-muted-foreground">• {model.description}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
