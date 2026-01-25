import { useState, useEffect } from "react";
import { format } from "date-fns";
import { History, RotateCcw, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useCoverLetterVersions, CoverLetterVersion } from "@/hooks/use-cover-letter-versions";
import { CoverLetter } from "@/hooks/use-cover-letters";

interface CoverLetterVersionHistoryProps {
  letter: CoverLetter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (title: string, content: string) => Promise<boolean>;
}

export function CoverLetterVersionHistory({
  letter,
  open,
  onOpenChange,
  onRestore,
}: CoverLetterVersionHistoryProps) {
  const { versions, isLoading, fetchVersions } = useCoverLetterVersions();
  const [previewVersion, setPreviewVersion] = useState<CoverLetterVersion | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<CoverLetterVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (open && letter) {
      fetchVersions(letter.id);
    }
  }, [open, letter, fetchVersions]);

  const handleRestore = async () => {
    if (!restoreVersion) return;
    
    setIsRestoring(true);
    const success = await onRestore(restoreVersion.title, restoreVersion.content);
    setIsRestoring(false);
    
    if (success) {
      setRestoreVersion(null);
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
              {letter && <span className="text-muted-foreground font-normal">- {letter.title}</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* Version List */}
            <div className="w-1/3 border-r border-border pr-4">
              <ScrollArea className="h-[400px]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-pulse text-muted-foreground">Loading versions...</div>
                  </div>
                ) : versions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <History className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium mb-1">No version history</h3>
                    <p className="text-sm text-muted-foreground">
                      Versions are created when you edit a cover letter
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Current Version */}
                    {letter && (
                      <div className="p-3 rounded-lg border-2 border-primary bg-primary/5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-primary">Current</span>
                        </div>
                        <p className="text-sm font-medium truncate">{letter.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(letter.updated_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    )}

                    {/* Previous Versions */}
                    {versions.map((version) => (
                      <div
                        key={version.id}
                        className={`p-3 rounded-lg border transition-colors cursor-pointer hover:bg-accent/50 ${
                          previewVersion?.id === version.id ? "border-primary bg-accent" : "border-border"
                        }`}
                        onClick={() => setPreviewVersion(version)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            Version {version.version_number}
                          </span>
                        </div>
                        <p className="text-sm font-medium truncate">{version.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(version.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewVersion(version);
                            }}
                          >
                            <Eye className="h-3 w-3" />
                            Preview
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRestoreVersion(version);
                            }}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Restore
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Preview Panel */}
            <div className="flex-1 flex flex-col">
              {previewVersion ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium">{previewVersion.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        Version {previewVersion.version_number} • {format(new Date(previewVersion.created_at), "PPp")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewVersion(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 border rounded-lg p-4 bg-muted/30">
                    <div className="whitespace-pre-wrap text-sm">
                      {previewVersion.content}
                    </div>
                  </ScrollArea>
                  <div className="flex justify-end mt-3">
                    <Button
                      onClick={() => setRestoreVersion(previewVersion)}
                      className="gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore This Version
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Select a version to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!restoreVersion} onOpenChange={() => setRestoreVersion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current cover letter content with Version {restoreVersion?.version_number}. 
              The current version will be saved in the history before restoring.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
