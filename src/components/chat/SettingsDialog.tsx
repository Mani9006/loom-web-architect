import { useState } from "react";
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
  LayoutDashboard,
  Trash2,
} from "lucide-react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClearAllConversations?: () => void;
  conversationCount?: number;
}

export function SettingsDialog({ 
  open, 
  onOpenChange,
  onClearAllConversations,
  conversationCount = 0,
}: SettingsDialogProps) {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

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

  const handleClearAll = () => {
    setClearConfirmOpen(false);
    onOpenChange(false);
    onClearAllConversations?.();
  };

  return (
    <>
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
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={() => handleNavigation("/dashboard")}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>Dashboard</span>
              </Button>
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
              {onClearAllConversations && conversationCount > 0 && (
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setClearConfirmOpen(true)}
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Clear All Conversations</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {conversationCount} {conversationCount === 1 ? "chat" : "chats"}
                  </span>
                </Button>
              )}
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

      {/* Clear All Confirmation */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all conversations?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {conversationCount} conversation{conversationCount !== 1 ? "s" : ""} and their messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
