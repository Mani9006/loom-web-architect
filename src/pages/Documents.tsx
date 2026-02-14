import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Plus, Eye, MoreVertical, FileText, FolderOpen } from "lucide-react";
import { format } from "date-fns";

interface Document {
  id: string;
  title: string;
  category: string;
  kind: string;
  createdOn: string;
  jobLinked: number;
}

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: cls } = await supabase
        .from("cover_letters")
        .select("id, title, created_at, job_title")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cls) {
        setDocuments(
          cls.map((cl) => ({
            id: cl.id, title: cl.title, category: "Cover Letter", kind: "other",
            createdOn: cl.created_at, jobLinked: cl.job_title ? 1 : 0,
          }))
        );
      }
    };
    load();
  }, []);

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
          <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add document</Button>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Title</TableHead>
              <TableHead className="font-semibold">Category</TableHead>
              <TableHead className="font-semibold">Kind</TableHead>
              <TableHead className="font-semibold">Created On</TableHead>
              <TableHead className="font-semibold">Job Linked</TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No documents yet</p>
                  <p className="text-sm mt-1">Upload resumes or create cover letters to see them here</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((doc) => (
                <TableRow key={doc.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium">{doc.title}</TableCell>
                  <TableCell><span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{doc.category}</span></TableCell>
                  <TableCell className="text-muted-foreground">{doc.kind}</TableCell>
                  <TableCell>{format(new Date(doc.createdOn), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{doc.jobLinked}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
