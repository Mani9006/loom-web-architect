import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db, tableMissing } from "@/product/lib/table";

export interface Person {
  id: string;
  name: string;
  company: string;
  title: string;
  linkedinUrl: string;
  email: string;
  notes: string;
}

export interface ResearchNote {
  id: string;
  title: string;
  body: string;
  company: string;
}

function localKey(userId: string, kind: "people" | "notes") {
  return `rp:${kind}:${userId}`;
}

export function usePeople() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await db().from("network_people").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (!error && data) {
      setPeople((data as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        name: String(row.name || ""),
        company: String(row.company || ""),
        title: String(row.title || ""),
        linkedinUrl: String(row.linkedin_url || ""),
        email: String(row.email || ""),
        notes: String(row.notes || ""),
      })));
    } else if (tableMissing(error)) {
      const raw = localStorage.getItem(localKey(user.id, "people"));
      setPeople(raw ? JSON.parse(raw) as Person[] : []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (person: Person) => {
    if (!user) return;
    const payload = {
      id: person.id,
      user_id: user.id,
      name: person.name,
      company: person.company,
      title: person.title,
      linkedin_url: person.linkedinUrl,
      email: person.email,
      notes: person.notes,
    };
    const { error } = await db().from("network_people").upsert(payload);
    const next = [...people.filter((p) => p.id !== person.id), person];
    setPeople(next);
    if (error) localStorage.setItem(localKey(user.id, "people"), JSON.stringify(next));
  }, [user, people]);

  const remove = useCallback(async (id: string) => {
    if (!user) return;
    await db().from("network_people").delete().eq("id", id).eq("user_id", user.id);
    const next = people.filter((p) => p.id !== id);
    setPeople(next);
    localStorage.setItem(localKey(user.id, "people"), JSON.stringify(next));
  }, [user, people]);

  return { people, loading, save, remove };
}

export function useNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await db().from("research_notes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (!error && data) {
      setNotes((data as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        title: String(row.title || ""),
        body: String(row.body || ""),
        company: String(row.company || ""),
      })));
    } else if (tableMissing(error)) {
      const raw = localStorage.getItem(localKey(user.id, "notes"));
      setNotes(raw ? JSON.parse(raw) as ResearchNote[] : []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (note: ResearchNote) => {
    if (!user) return;
    const { error } = await db().from("research_notes").upsert({
      id: note.id,
      user_id: user.id,
      title: note.title,
      body: note.body,
      company: note.company,
    });
    const next = [...notes.filter((n) => n.id !== note.id), note];
    setNotes(next);
    if (error) localStorage.setItem(localKey(user.id, "notes"), JSON.stringify(next));
  }, [user, notes]);

  const remove = useCallback(async (id: string) => {
    if (!user) return;
    await db().from("research_notes").delete().eq("id", id).eq("user_id", user.id);
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    localStorage.setItem(localKey(user.id, "notes"), JSON.stringify(next));
  }, [user, notes]);

  return { notes, loading, save, remove };
}
