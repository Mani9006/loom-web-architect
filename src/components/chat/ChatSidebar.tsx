import { useState } from "react";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "./SettingsDialog";

type Conversation = {
  id: string;
  title: string;
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

  return (
    <>
      <Sidebar className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
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

        <SidebarContent className="px-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {conversations.map((conv) => (
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
