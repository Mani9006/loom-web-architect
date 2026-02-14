import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  User, Moon, Sun, HelpCircle, MessageSquare, ExternalLink,
  History, LayoutDashboard, Trash2, Sparkles,
} from "lucide-react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClearAllConversations?: () => void;
  conversationCount?: number;
}

export function SettingsDialog({ 
  open, onOpenChange, onClearAllConversations, conversationCount = 0,
}: SettingsDialogProps) {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") return document.documentElement.classList.contains("dark");
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

  const handleNavigation = (path: string) => { onOpenChange(false); navigate(path); };
  const handleClearAll = () => { setClearConfirmOpen(false); onOpenChange(false); onClearAllConversations?.(); };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">{title}</h3>
      {children}
    </div>
  );

  const NavButton = ({ icon: Icon, label, onClick, destructive }: { icon: any; label: string; onClick: () => void; destructive?: boolean }) => (
    <Button
      variant="ghost"
      className={`w-full justify-start gap-3 h-11 font-medium ${destructive ? "text-destructive hover:text-destructive hover:bg-destructive/10" : ""}`}
      onClick={onClick}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </Button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Settings
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <Section title="Account">
              <NavButton icon={User} label="Profile Settings" onClick={() => handleNavigation("/profile")} />
              <NavButton icon={LayoutDashboard} label="Dashboard" onClick={() => handleNavigation("/dashboard")} />
            </Section>

            <Separator />

            <Section title="Appearance">
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent transition-colors">
                <div className="flex items-center gap-3">
                  {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <Label htmlFor="dark-mode" className="cursor-pointer font-medium">Dark Mode</Label>
                </div>
                <Switch id="dark-mode" checked={darkMode} onCheckedChange={toggleDarkMode} />
              </div>
            </Section>

            <Separator />

            <Section title="Chat">
              <NavButton icon={History} label="View Chat History" onClick={() => handleNavigation("/")} />
              {onClearAllConversations && conversationCount > 0 && (
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-11 font-medium text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setClearConfirmOpen(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear All Conversations</span>
                  <span className="ml-auto text-xs bg-destructive/10 px-2 py-0.5 rounded-full">
                    {conversationCount}
                  </span>
                </Button>
              )}
            </Section>

            <Separator />

            <Section title="Help & Support">
              <Button variant="ghost" className="w-full justify-start gap-3 h-11 font-medium" asChild>
                <a href="https://docs.lovable.dev" target="_blank" rel="noopener noreferrer">
                  <HelpCircle className="w-4 h-4" />
                  <span>Help Center</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                </a>
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3 h-11 font-medium" asChild>
                <a href="mailto:support@lovable.dev" target="_blank" rel="noopener noreferrer">
                  <MessageSquare className="w-4 h-4" />
                  <span>Contact Support</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                </a>
              </Button>
            </Section>
          </div>
        </DialogContent>
      </Dialog>

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
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
