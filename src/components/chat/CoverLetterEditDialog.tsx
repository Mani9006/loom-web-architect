import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { CoverLetter } from "@/hooks/use-cover-letters";

interface CoverLetterEditDialogProps {
  letter: CoverLetter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: { title: string; content: string }) => Promise<boolean>;
}

export function CoverLetterEditDialog({
  letter,
  open,
  onOpenChange,
  onSave,
}: CoverLetterEditDialogProps) {
  const [title, setTitle] = useState(letter?.title || "");
  const [content, setContent] = useState(letter?.content || "");
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when letter changes
  if (letter && title !== letter.title && content !== letter.content) {
    setTitle(letter.title);
    setContent(letter.content);
  }

  const handleSave = async () => {
    if (!letter || !title.trim() || !content.trim()) return;
    
    setIsSaving(true);
    const success = await onSave(letter.id, { title: title.trim(), content: content.trim() });
    setIsSaving(false);
    
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Cover Letter</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 flex-1 overflow-hidden">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cover letter title..."
            />
          </div>
          
          <div className="space-y-2 flex-1">
            <Label htmlFor="edit-content">Content</Label>
            <Textarea
              id="edit-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Cover letter content..."
              className="min-h-[300px] resize-none"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !title.trim() || !content.trim()}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
