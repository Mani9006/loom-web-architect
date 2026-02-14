import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Search, Plus, Users, FolderOpen } from "lucide-react";

interface Contact {
  id: string;
  fullName: string;
  company: string;
  relationship: string;
  linkedin: string;
  email: string;
  createdAt: Date;
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", company: "", relationship: "", linkedin: "", email: "" });

  const addContact = () => {
    if (!form.fullName.trim()) return;
    setContacts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ...form, createdAt: new Date() },
    ]);
    setForm({ fullName: "", company: "", relationship: "", linkedin: "", email: "" });
    setDialogOpen(false);
  };

  const filtered = contacts.filter(
    (c) => c.fullName.toLowerCase().includes(search.toLowerCase()) || c.company.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-accent" /> Contacts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your professional network</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Contact</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
              <div className="space-y-3">
                {[
                  { key: "fullName", label: "Full Name", placeholder: "John Doe" },
                  { key: "company", label: "Company", placeholder: "Google" },
                  { key: "relationship", label: "Relationship", placeholder: "Recruiter" },
                  { key: "linkedin", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/..." },
                  { key: "email", label: "Email", placeholder: "john@example.com" },
                ].map((f) => (
                  <div key={f.key}>
                    <Label>{f.label}</Label>
                    <Input
                      value={form[f.key as keyof typeof form]}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
                <Button onClick={addContact} className="w-full">Create Contact</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Full Name</TableHead>
              <TableHead className="font-semibold">Company</TableHead>
              <TableHead className="font-semibold">Relationship</TableHead>
              <TableHead className="font-semibold">LinkedIn</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                  <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="font-medium">No contacts yet</p>
                  <p className="text-sm mt-1">Start building your professional network</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium">{c.fullName}</TableCell>
                  <TableCell>{c.company}</TableCell>
                  <TableCell><span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">{c.relationship}</span></TableCell>
                  <TableCell className="text-primary truncate max-w-[150px]">{c.linkedin}</TableCell>
                  <TableCell>{c.email}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
