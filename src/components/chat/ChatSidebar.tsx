import { useState, useMemo, useRef, useEffect } from "react";
import { PenSquare, MessageSquare, Trash2, Settings, Search, Check, X, FolderPlus, Folder, ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "./SettingsDialog";
import { isToday, isYesterday, isWithinInterval, subDays } from "date-fns";

export type ConversationFolder = {
  id: string;
  name: string;
  color: string;
};

type Conversation = {
  id: string;
  title: string;
  chat_mode?: string;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
};

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversationId?: string;
  folders?: ConversationFolder[];
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  onCreateFolder?: (name: string, color: string) => void;
  onDeleteFolder?: (id: string) => void;
  onMoveToFolder?: (conversationId: string, folderId: string | null) => void;
}

const FOLDER_COLORS = [
  { name: "Blue", value: "blue", class: "bg-blue-500" },
  { name: "Green", value: "green", class: "bg-green-500" },
  { name: "Purple", value: "purple", class: "bg-purple-500" },
  { name: "Orange", value: "orange", class: "bg-orange-500" },
  { name: "Red", value: "red", class: "bg-red-500" },
  { name: "Yellow", value: "yellow", class: "bg-yellow-500" },
];

const getFolderColorClass = (color: string) => {
  const found = FOLDER_COLORS.find((c) => c.value === color);
  return found?.class || "bg-blue-500";
};

export function ChatSidebar({
  conversations,
  currentConversationId,
  folders = [],
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onCreateFolder,
  onDeleteFolder,
  onMoveToFolder,
}: ChatSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("blue");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter((conv) =>
      conv.title.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  // Separate conversations by folder
  const { folderedConversations, unfolderedConversations } = useMemo(() => {
    const foldered: Record<string, Conversation[]> = {};
    const unfoldered: Conversation[] = [];

    filteredConversations.forEach((conv) => {
      if (conv.folder_id) {
        if (!foldered[conv.folder_id]) {
          foldered[conv.folder_id] = [];
        }
        foldered[conv.folder_id].push(conv);
      } else {
        unfoldered.push(conv);
      }
    });

    return { folderedConversations: foldered, unfolderedConversations: unfoldered };
  }, [filteredConversations]);

  // Group unfoldered conversations by date like ChatGPT
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

    unfolderedConversations.forEach((conv) => {
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
  }, [unfolderedConversations]);

  const handleStartEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleSaveEdit = () => {
    if (editingId && editingTitle.trim() && onRenameConversation) {
      onRenameConversation(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim() && onCreateFolder) {
      onCreateFolder(newFolderName.trim(), newFolderColor);
      setNewFolderName("");
      setNewFolderColor("blue");
      setNewFolderDialogOpen(false);
    }
  };

  const renderConversationItem = (conv: Conversation) => (
    <SidebarMenuItem key={conv.id}>
      {editingId === conv.id ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-sm"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleSaveEdit}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCancelEdit}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <SidebarMenuButton
          onClick={() => onSelectConversation(conv.id)}
          isActive={conv.id === currentConversationId}
          className="group justify-between"
          tooltip={isCollapsed ? conv.title : undefined}
        >
          <div
            className="flex items-center gap-2 min-w-0"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (onRenameConversation) {
                handleStartEditing(conv);
              }
            }}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            {!isCollapsed && (
              <span className="truncate">{conv.title}</span>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-1">
              {onMoveToFolder && folders.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 hover:bg-sidebar-accent rounded cursor-pointer"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-popover border-border z-50">
                    <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
                      Move to folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {folders.map((folder) => (
                      <DropdownMenuItem
                        key={folder.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveToFolder(conv.id, folder.id);
                        }}
                      >
                        <div className={cn("w-2 h-2 rounded-full mr-2", getFolderColorClass(folder.color))} />
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                    {conv.folder_id && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveToFolder(conv.id, null);
                          }}
                        >
                          Remove from folder
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
                className="p-1 hover:bg-destructive/20 rounded cursor-pointer"
                title="Delete conversation"
              >
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
              </span>
            </div>
          )}
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  );

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
            {convs.map(renderConversationItem)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  const renderFolder = (folder: ConversationFolder) => {
    const isExpanded = expandedFolders.has(folder.id);
    const folderConvs = folderedConversations[folder.id] || [];

    return (
      <SidebarGroup key={folder.id}>
        <div className="flex items-center justify-between px-2 py-1 group">
          <button
            onClick={() => toggleFolder(folder.id)}
            className="flex items-center gap-2 text-sm text-sidebar-foreground hover:text-sidebar-foreground/80 flex-1 text-left"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <div className={cn("w-2 h-2 rounded-full", getFolderColorClass(folder.color))} />
            {!isCollapsed && (
              <span className="truncate">{folder.name}</span>
            )}
            {!isCollapsed && (
              <span className="text-xs text-muted-foreground ml-auto mr-2">
                {folderConvs.length}
              </span>
            )}
          </button>
          {!isCollapsed && onDeleteFolder && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder(folder.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-sidebar-accent rounded transition-opacity cursor-pointer"
            >
              <Trash2 className="w-3 h-3 text-muted-foreground" />
            </span>
          )}
        </div>
        {isExpanded && folderConvs.length > 0 && (
          <SidebarGroupContent className="ml-4">
            <SidebarMenu>
              {folderConvs.map(renderConversationItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        )}
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

        <div className="px-3 mb-2 flex gap-2">
          <Button
            onClick={onNewChat}
            variant="outline"
            className={cn(
              "flex-1 justify-start gap-2 bg-sidebar-accent border-sidebar-border hover:bg-sidebar-accent/80 text-sidebar-foreground",
              isCollapsed && "justify-center px-2"
            )}
          >
            <PenSquare className="w-4 h-4" />
            {!isCollapsed && "New chat"}
          </Button>
          {!isCollapsed && onCreateFolder && (
            <Button
              onClick={() => setNewFolderDialogOpen(true)}
              variant="outline"
              size="icon"
              className="bg-sidebar-accent border-sidebar-border hover:bg-sidebar-accent/80 text-sidebar-foreground"
              title="Create folder"
            >
              <FolderPlus className="w-4 h-4" />
            </Button>
          )}
        </div>

        {!isCollapsed && (
          <div className="px-3 mb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        )}

        <SidebarContent className="px-2 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {/* Folders section */}
            {folders.length > 0 && !searchQuery && (
              <>
                {folders.map(renderFolder)}
                {unfolderedConversations.length > 0 && (
                  <div className="my-2 mx-2 border-t border-sidebar-border" />
                )}
              </>
            )}

            {/* Date-grouped conversations */}
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

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Folder Name</label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Work, Personal, Projects..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateFolder();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex gap-2">
                {FOLDER_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setNewFolderColor(color.value)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      color.class,
                      newFolderColor === color.value
                        ? "ring-2 ring-offset-2 ring-foreground"
                        : "opacity-60 hover:opacity-100"
                    )}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
