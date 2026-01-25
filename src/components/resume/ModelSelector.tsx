import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Sparkles, Zap } from "lucide-react";

export type AIModel = {
  id: string;
  name: string;
  provider: "gemini" | "openai" | "anthropic";
  description: string;
};

export const AI_MODELS: AIModel[] = [
  // Gemini models (via Lovable AI)
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
  // OpenAI models
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Most capable OpenAI",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast & affordable",
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    description: "High performance",
  },
  // Anthropic Claude models
  {
    id: "claude-sonnet",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    description: "Balanced & capable",
  },
  {
    id: "claude-opus",
    name: "Claude Opus 4",
    provider: "anthropic",
    description: "Most capable Claude",
  },
  {
    id: "claude-haiku",
    name: "Claude Haiku",
    provider: "anthropic",
    description: "Fast & efficient",
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
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const selectedModel = AI_MODELS.find((m) => m.id === value);
  const Icon = selectedModel ? providerIcons[selectedModel.provider] : Sparkles;

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full sm:w-[200px] bg-background">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${selectedModel ? providerColors[selectedModel.provider] : ""}`} />
          <SelectValue placeholder="Select AI Model" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover z-50">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Gemini (Free)</div>
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
        
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Anthropic</div>
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
