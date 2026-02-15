import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, Download, Trash2, MoreVertical, FileText, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Document {
  id: string;
  title: string;
  category: string;
  kind: string;
  createdOn: string;
  jobLinked: number;
  storagePath?: string;
  source: "cover_letter" | "user_document";
}

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const { toast } = useToast();

  const loadDocuments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch cover letters
    const { data: cls } = await supabase
      .from("cover_letters")
      .select("id, title, created_at, job_title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Fetch user documents
    const { data: docs } = await supabase
      .from("user_documents" as any)
      .select("id, file_name, file_type, category, file_size, storage_path, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

    const allDocs: Document[] = [
      ...(cls || []).map((cl) => ({
        id: cl.id,
        title: cl.title,
        category: "Cover Letter",
        kind: "text",
        createdOn: cl.created_at,
        jobLinked: cl.job_title ? 1 : 0,
        source: "cover_letter" as const,
      })),
      ...((docs as any[]) || []).map((d) => ({
        id: d.id,
        title: d.file_name,
        category: capitalize(d.category),
        kind: d.file_type,
        createdOn: d.created_at,
        jobLinked: 0,
        storagePath: d.storage_path,
        source: "user_document" as const,
      })),
    ].sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());

    setDocuments(allDocs);
  };

  useEffect(() => { loadDocuments(); }, []);

  const handleDownload = async (doc: Document) => {
    if (!doc.storagePath) return;
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storagePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (doc: Document) => {
    if (doc.source === "user_document") {
      if (doc.storagePath) {
        await supabase.storage.from("documents").remove([doc.storagePath]);
      }
      await supabase.from("user_documents" as any).delete().eq("id", doc.id);
      toast({ title: "Document deleted", description: `"${doc.title}" has been removed.` });
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    }
  };

  const filtered = documents.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" /> Documents
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">All your resumes, cover letters, and materials</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-52" />
          </div>
          <Button size="sm" className="gap-2" onClick={() => setUploadOpen(true)}>
            <Plus className="w-4 h-4" /> Add document
          </Button>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Title</TableHead>
              <TableHead className="font-semibold">Category</TableHead>
              <TableHead className="font-semibold">Type</TableHead>
              <TableHead className="font-semibold">Created On</TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No documents yet</p>
                  <p className="text-sm mt-1">Upload resumes or create cover letters to see them here</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((doc) => (
                <TableRow key={`${doc.source}-${doc.id}`} className="hover:bg-muted/20">
                  <TableCell className="font-medium">{doc.title}</TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {doc.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{doc.kind}</TableCell>
                  <TableCell>{format(new Date(doc.createdOn), "MMM dd, yyyy")}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {doc.storagePath && (
                          <DropdownMenuItem onClick={() => handleDownload(doc)} className="gap-2">
                            <Download className="h-4 w-4" /> Download
                          </DropdownMenuItem>
                        )}
                        {doc.source === "user_document" && (
                          <DropdownMenuItem
                            onClick={() => handleDelete(doc)}
                            className="gap-2 text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <DocumentUpload
            onTextExtracted={() => {
              setUploadOpen(false);
              loadDocuments();
            }}
            persistToDocuments={true}
            label="Drop your document here"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
