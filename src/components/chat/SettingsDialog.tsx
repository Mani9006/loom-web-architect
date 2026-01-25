import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Moon,
  Sun,
  HelpCircle,
  MessageSquare,
  ExternalLink,
  History,
  Brain,
  Trash2,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isLoadingCount, setIsLoadingCount] = useState(false);

  useEffect(() => {
    if (open) {
      fetchMemoryCount();
    }
  }, [open]);

  const fetchMemoryCount = async () => {
    setIsLoadingCount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-management`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "count" }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMemoryCount(data.count || 0);
      }
    } catch (error) {
      console.error("Failed to fetch memory count:", error);
    } finally {
      setIsLoadingCount(false);
    }
  };

  const handleClearMemory = async () => {
    setIsClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Error",
          description: "You must be logged in to clear memories",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-management`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "clear" }),
        }
      );

      if (response.ok) {
        setMemoryCount(0);
        toast({
          title: "Memory Cleared",
          description: "All your conversation memories have been deleted.",
        });
      } else {
        throw new Error("Failed to clear memories");
      }
    } catch (error) {
      console.error("Failed to clear memory:", error);
      toast({
        title: "Error",
        description: "Failed to clear memories. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
    }
  };

  const toggleDarkMode = (enabled: boolean) => {
    setDarkMode(enabled);
    if (enabled) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleNavigation = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings & Help</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Account Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Account</h3>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleNavigation("/profile")}
            >
              <User className="w-5 h-5" />
              <span>Profile Settings</span>
            </Button>
          </div>

          <Separator />

          {/* AI Memory Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">AI Memory</h3>
            <div className="px-3 py-2 space-y-3">
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-purple-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Remembered Facts</p>
                  <p className="text-xs text-muted-foreground">
                    {isLoadingCount ? (
                      "Loading..."
                    ) : memoryCount !== null ? (
                      `${memoryCount} memories stored`
                    ) : (
                      "Unable to load"
                    )}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The AI remembers your preferences and past interactions to provide personalized responses.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-destructive hover:text-destructive"
                    disabled={isClearing || memoryCount === 0}
                  >
                    {isClearing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Clear All Memories
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear AI Memory?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {memoryCount || 0} memories the AI has stored about you. 
                      The AI will no longer remember your preferences or past conversations. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearMemory}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Clear Memory
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <Separator />

          {/* Appearance */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Appearance</h3>
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3">
                {darkMode ? (
                  <Moon className="w-5 h-5" />
                ) : (
                  <Sun className="w-5 h-5" />
                )}
                <Label htmlFor="dark-mode" className="cursor-pointer">
                  Dark Mode
                </Label>
              </div>
              <Switch
                id="dark-mode"
                checked={darkMode}
                onCheckedChange={toggleDarkMode}
              />
            </div>
          </div>

          <Separator />

          {/* Chat History */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Chat</h3>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleNavigation("/")}
            >
              <History className="w-5 h-5" />
              <span>View Chat History</span>
            </Button>
          </div>

          <Separator />

          {/* Help & Support */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Help & Support</h3>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              asChild
            >
              <a
                href="https://docs.lovable.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                <HelpCircle className="w-5 h-5" />
                <span>Help Center</span>
                <ExternalLink className="w-4 h-4 ml-auto text-muted-foreground" />
              </a>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              asChild
            >
              <a
                href="mailto:support@lovable.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageSquare className="w-5 h-5" />
                <span>Contact Support</span>
                <ExternalLink className="w-4 h-4 ml-auto text-muted-foreground" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
