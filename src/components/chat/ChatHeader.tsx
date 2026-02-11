import { User } from "@supabase/supabase-js";
import { LogOut, Sparkles } from "lucide-react";
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

interface ChatHeaderProps {
  user: User;
  displayName: string;
  onSignOut: () => void;
}

export function ChatHeader({ user, displayName, onSignOut }: ChatHeaderProps) {
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="lg:hidden" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center lg:hidden">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold lg:hidden">CareerPrep<span className="text-primary">.ai</span></span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex items-center gap-2 bg-secondary border-border hover:bg-accent"
        >
          <Sparkles className="w-4 h-4" />
          Upgrade
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 focus:outline-none">
              <Avatar className="w-8 h-8 bg-primary cursor-pointer">
                <AvatarFallback className="bg-transparent text-primary-foreground text-sm font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-popover border-border">
            <div className="px-3 py-3">
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex items-center gap-3 mt-3">
                <Avatar className="w-14 h-14 bg-primary">
                  <AvatarFallback className="bg-transparent text-primary-foreground text-xl font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">Hi, {displayName}!</p>
                </div>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={onSignOut}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
