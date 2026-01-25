import { useState } from "react";
import { format } from "date-fns";
import { FileText, Trash2, MoreVertical, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CoverLetter } from "@/hooks/use-cover-letters";

interface SavedCoverLettersListProps {
  coverLetters: CoverLetter[];
  isLoading: boolean;
  onSelect: (coverLetter: CoverLetter) => void;
  onDelete: (id: string) => Promise<boolean>;
}

export function SavedCoverLettersList({
  coverLetters,
  isLoading,
  onSelect,
  onDelete,
}: SavedCoverLettersListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    await onDelete(deleteId);
    setIsDeleting(false);
    setDeleteId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-pulse text-muted-foreground">Loading saved cover letters...</div>
      </div>
    );
  }

  if (coverLetters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileText className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium mb-1">No saved cover letters</h3>
        <p className="text-sm text-muted-foreground">
          Generate a cover letter and save it to view it here
        </p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[400px]">
        <div className="space-y-2 p-1">
          {coverLetters.map((letter) => (
            <div
              key={letter.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors group cursor-pointer"
              onClick={() => onSelect(letter)}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{letter.title}</h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  {letter.company_name && (
                    <span className="truncate">{letter.company_name}</span>
                  )}
                  {letter.company_name && letter.job_title && (
                    <span>•</span>
                  )}
                  {letter.job_title && (
                    <span className="truncate">{letter.job_title}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(letter.updated_at), "MMM d, yyyy")}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onSelect(letter)}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(letter.id);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cover letter?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The cover letter will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
