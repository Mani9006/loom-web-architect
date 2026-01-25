import { useState, useMemo } from "react";
import { PenSquare, MessageSquare, Trash2, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "./SettingsDialog";
import { isToday, isYesterday, isWithinInterval, subDays } from "date-fns";

type Conversation = {
  id: string;
  title: string;
  chat_mode?: string;
  created_at: string;
  updated_at: string;
};

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversationId?: string;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
}: ChatSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Group conversations by date like ChatGPT
  const groupedConversations = useMemo(() => {
    const now = new Date();
    const groups: {
      today: Conversation[];
      yesterday: Conversation[];
      previous7Days: Conversation[];
      previous30Days: Conversation[];
      older: Conversation[];
    } = {
      today: [],
      yesterday: [],
      previous7Days: [],
      previous30Days: [],
      older: [],
    };

    conversations.forEach((conv) => {
      const date = new Date(conv.updated_at);
      if (isToday(date)) {
        groups.today.push(conv);
      } else if (isYesterday(date)) {
        groups.yesterday.push(conv);
      } else if (
        isWithinInterval(date, { start: subDays(now, 7), end: subDays(now, 2) })
      ) {
        groups.previous7Days.push(conv);
      } else if (
        isWithinInterval(date, { start: subDays(now, 30), end: subDays(now, 8) })
      ) {
        groups.previous30Days.push(conv);
      } else {
        groups.older.push(conv);
      }
    });

    return groups;
  }, [conversations]);

  const renderConversationGroup = (
    label: string,
    convs: Conversation[]
  ) => {
    if (convs.length === 0) return null;

    return (
      <SidebarGroup key={label}>
        {!isCollapsed && (
          <SidebarGroupLabel className="text-xs text-muted-foreground px-2 py-1">
            {label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {convs.map((conv) => (
              <SidebarMenuItem key={conv.id}>
                <SidebarMenuButton
                  onClick={() => onSelectConversation(conv.id)}
                  isActive={conv.id === currentConversationId}
                  className="group justify-between"
                  tooltip={isCollapsed ? conv.title : undefined}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    {!isCollapsed && (
                      <span className="truncate">{conv.title}</span>
                    )}
                  </div>
                  {!isCollapsed && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-sidebar-accent rounded transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <>
      <Sidebar className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              {!isCollapsed && (
                <span className="font-semibold text-sidebar-foreground">AI Assistant</span>
              )}
            </div>
            <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar-accent rounded-lg p-1.5" />
          </div>
        </SidebarHeader>

        <div className="px-3 mb-2">
          <Button
            onClick={onNewChat}
            variant="outline"
            className={cn(
              "w-full justify-start gap-2 bg-sidebar-accent border-sidebar-border hover:bg-sidebar-accent/80 text-sidebar-foreground",
              isCollapsed && "justify-center px-2"
            )}
          >
            <PenSquare className="w-4 h-4" />
            {!isCollapsed && "New chat"}
          </Button>
        </div>

        <SidebarContent className="px-2 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {renderConversationGroup("Today", groupedConversations.today)}
            {renderConversationGroup("Yesterday", groupedConversations.yesterday)}
            {renderConversationGroup("Previous 7 Days", groupedConversations.previous7Days)}
            {renderConversationGroup("Previous 30 Days", groupedConversations.previous30Days)}
            {renderConversationGroup("Older", groupedConversations.older)}
            
            {conversations.length === 0 && !isCollapsed && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No conversations yet.
                <br />
                Start a new chat!
              </div>
            )}
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter className="p-3">
          <Button
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
            className={cn(
              "w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent",
              isCollapsed && "justify-center px-2"
            )}
          >
            <Settings className="w-4 h-4" />
            {!isCollapsed && "Settings & help"}
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
