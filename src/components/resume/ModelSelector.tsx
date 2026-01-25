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
  // OpenAI models
  {
    id: "gpt-5.2-chat-latest",
    name: "GPT-5.2 Chat",
    provider: "openai",
    description: "Latest & most capable",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Fast multimodal",
  },
  {
    id: "gpt-4o-mini-search-preview",
    name: "GPT-4o Mini Search",
    provider: "openai",
    description: "Search preview",
  },
  // Anthropic Claude models
  {
    id: "claude-haiku-4",
    name: "Claude Haiku 4.x",
    provider: "anthropic",
    description: "Fast & efficient",
  },
  {
    id: "claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    description: "Most capable",
  },
  {
    id: "claude-haiku-3",
    name: "Claude Haiku 3",
    provider: "anthropic",
    description: "Legacy fast model",
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
