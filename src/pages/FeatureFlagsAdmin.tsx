/**
 * Owner-only admin page to toggle feature flags at runtime.
 *
 * Reachable at /admin/flags. Owner sees a row per flag with:
 *   - current resolved state (on/off) + source (local / env / default)
 *   - "Force on" / "Force off" / "Clear override" controls
 *
 * Overrides are saved to localStorage (`rp.flags.overrides`) and apply
 * instantly to the current browser. Other browsers / users are unaffected.
 *
 * For permanent rollout to all users, the owner sets `VITE_ENABLE_<NAME>=true`
 * in Vercel's *Production* env vars and redeploys.
 */
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, TestTube } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import {
  FLAG_SPECS,
  useFlagsStore,
  useResolvedFlag,
  type FlagName,
} from "@/lib/feature-flags";

export default function FeatureFlagsAdmin() {
  const env = getEnv();
  const clearAllLocal = useFlagsStore((s) => s.clearAllLocal);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4 mr-1" /> Admin
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TestTube className="size-6 text-primary" />
            Feature Flags
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Environment: <Badge variant="outline" className="ml-1">{env}</Badge>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearAllLocal();
            toast.success("All local overrides cleared");
          }}
        >
          <RotateCcw className="size-4 mr-1.5" />
          Reset all
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How this works</CardTitle>
          <CardDescription className="space-y-1 text-xs">
            <span className="block">
              Toggles here are saved to <code className="text-[10.5px] bg-muted px-1 py-0.5 rounded">localStorage</code> for
              <strong> this browser only</strong>. They don't affect other users.
            </span>
            <span className="block">
              For permanent rollout to all users, set <code className="text-[10.5px] bg-muted px-1 py-0.5 rounded">VITE_ENABLE_&lt;NAME&gt;=true</code>{" "}
              in Vercel's Production env vars and redeploy.
            </span>
            <span className="block">
              Source order: <strong>Local override</strong> &gt; <strong>Env var</strong> &gt; <strong>Env default</strong> (off in production, on in staging/dev).
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {FLAG_SPECS.map((spec) => (
          <FlagRow key={spec.name} name={spec.name} label={spec.label} description={spec.description} />
        ))}
      </div>
    </div>
  );
}

function FlagRow({ name, label, description }: { name: FlagName; label: string; description: string }) {
  const resolved = useResolvedFlag(name);
  const setLocal = useFlagsStore((s) => s.setLocal);
  const clearLocal = useFlagsStore((s) => s.clearLocal);

  const onToggle = (checked: boolean) => {
    setLocal(name, checked);
    toast.success(`${label} forced ${checked ? "ON" : "OFF"} (this browser)`);
  };

  const onClear = () => {
    clearLocal(name);
    toast.message(`${label} override removed — falling back to ${resolved.source === "env" ? "env var" : "default"}`);
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{label}</h3>
              <code className="text-[10.5px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{name}</code>
              <SourceBadge resolved={resolved} />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch checked={resolved.enabled} onCheckedChange={onToggle} />
            {resolved.source === "local" && (
              <Button variant="ghost" size="icon" onClick={onClear} title="Clear local override">
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceBadge({ resolved }: { resolved: ReturnType<typeof useResolvedFlag> }) {
  if (resolved.source === "local") {
    return (
      <Badge variant={resolved.enabled ? "default" : "destructive"} className="text-[10px]">
        Local: {resolved.enabled ? "ON" : "OFF"}
      </Badge>
    );
  }
  if (resolved.source === "env") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        Env: {resolved.enabled ? "ON" : "OFF"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      Default: {resolved.enabled ? "ON" : "OFF"}
    </Badge>
  );
}
