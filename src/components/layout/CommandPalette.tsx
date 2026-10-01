/**
 * ⌘K command menu: jump to any page or run a common action.
 *
 * Built on the shadcn Command (cmdk) inside a Radix Dialog, so focus is
 * trapped while open and returns to the trigger on close. Items list their
 * "g then x" shortcut so the palette also teaches the keyboard.
 */
import { useNavigate } from "react-router-dom";
import { FilePlus2, LogOut, Moon, Play, Search, Sun, Inbox } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/layout/Kbd";
import { accountPages, adminPages, destinations, otherPages } from "@/components/layout/navigation";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showAdmin: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSignOut: () => void;
}

export function CommandPalette({ open, onOpenChange, showAdmin, theme, onToggleTheme, onSignOut }: CommandPaletteProps) {
  const navigate = useNavigate();

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const go = (path: string) => run(() => navigate(path));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go to a page or run an action"
      description="Type to filter. Use the arrow keys to move and Enter to choose."
    >
      <CommandInput placeholder="Search pages and actions" aria-label="Search pages and actions" />
      <CommandList className="max-h-[min(420px,60dvh)] pb-1.5">
        <CommandEmpty>No pages or actions match.</CommandEmpty>

        <CommandGroup heading="Go to">
          {destinations.map((d) => (
            <CommandItem
              key={d.path}
              value={`${d.label} ${d.keywords?.join(" ") ?? ""}`}
              onSelect={() => go(d.path)}
            >
              <d.icon aria-hidden />
              {d.label}
              <CommandShortcut aria-label={`Shortcut: G then ${d.shortcut.toUpperCase()}`}>
                <Kbd>G</Kbd>
                <Kbd>{d.shortcut.toUpperCase()}</Kbd>
              </CommandShortcut>
            </CommandItem>
          ))}
          {destinations.flatMap((d) =>
            d.secondary.map((page) => (
              <CommandItem
                key={page.path}
                value={`${page.label} ${d.label} ${page.keywords?.join(" ") ?? ""}`}
                onSelect={() => go(page.path)}
              >
                <page.icon aria-hidden />
                {page.label}
                <span className="ml-auto text-xs text-muted-foreground">{d.label}</span>
              </CommandItem>
            )),
          )}
          {otherPages.map((page) => (
            <CommandItem key={page.path} value={`${page.label} coach ask`} onSelect={() => go(page.path)}>
              <page.icon aria-hidden />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="Search jobs find" onSelect={() => go("/job-search")}>
            <Search aria-hidden />
            Search jobs
          </CommandItem>
          <CommandItem value="New resume create" onSelect={() => go("/resume-builder/v2")}>
            <FilePlus2 aria-hidden />
            New resume
          </CommandItem>
          <CommandItem value="Open inbox email" onSelect={() => go("/inbox")}>
            <Inbox aria-hidden />
            Open inbox
          </CommandItem>
          <CommandItem value="Start or stop auto-apply agent" onSelect={() => go("/agent")}>
            <Play aria-hidden />
            Start or stop auto-apply
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Account">
          {accountPages.map((page) => (
            <CommandItem
              key={page.path}
              value={`${page.label} ${page.keywords?.join(" ") ?? ""}`}
              onSelect={() => go(page.path)}
            >
              <page.icon aria-hidden />
              {page.label}
            </CommandItem>
          ))}
          <CommandItem value="Switch theme dark light mode" onSelect={() => run(onToggleTheme)}>
            {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
            Switch to {theme === "dark" ? "light" : "dark"} theme
          </CommandItem>
          <CommandItem value="Sign out log out" onSelect={() => run(onSignOut)}>
            <LogOut aria-hidden />
            Sign out
          </CommandItem>
        </CommandGroup>

        {showAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Admin">
              {adminPages.map((page) => (
                <CommandItem key={page.path} value={`${page.label} admin`} onSelect={() => go(page.path)}>
                  <page.icon aria-hidden />
                  {page.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="hidden items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground sm:flex" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          to move
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          to open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Esc</Kbd>
          to close
        </span>
      </div>
    </CommandDialog>
  );
}
