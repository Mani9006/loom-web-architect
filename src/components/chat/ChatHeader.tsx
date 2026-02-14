import { User } from "@supabase/supabase-js";
import { LogOut, Sparkles, LayoutDashboard } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNavigate } from "react-router-dom";

interface ChatHeaderProps {
  user: User;
  displayName: string;
  onSignOut: () => void;
}

export function ChatHeader({ user, displayName, onSignOut }: ChatHeaderProps) {
  const navigate = useNavigate();
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="lg:hidden" />
        <div className="flex items-center gap-2 lg:hidden">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold">CareerPrep<span className="text-primary">.ai</span></span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
          className="hidden sm:flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 focus:outline-none">
              <Avatar className="w-8 h-8 cursor-pointer border-2 border-transparent hover:border-primary/20 transition-colors">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="px-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2">
              <Sparkles className="w-4 h-4" /> Profile Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer gap-2">
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="cursor-pointer text-destructive gap-2">
              <LogOut className="w-4 h-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
