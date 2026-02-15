import { cn } from "@/lib/utils";
import { ResumeJSON } from "@/types/resume";
import {
  User, AlignLeft, Briefcase, GraduationCap, Wrench,
  FolderKanban, Award, GripVertical,
} from "lucide-react";

export type SectionId = "personal" | "summary" | "experience" | "education" | "skills" | "projects" | "certifications";

interface SectionMeta {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  count: (d: ResumeJSON) => number | null;
}

const SECTIONS: SectionMeta[] = [
  { id: "personal", label: "Personal Info", icon: User, count: () => null },
  { id: "summary", label: "Summary", icon: AlignLeft, count: () => null },
  { id: "experience", label: "Experience", icon: Briefcase, count: (d) => d.experience.filter((e) => e.company_or_client).length },
  { id: "education", label: "Education", icon: GraduationCap, count: (d) => d.education.filter((e) => e.institution).length },
  { id: "skills", label: "Skills", icon: Wrench, count: (d) => Object.values(d.skills).filter((s) => s.length > 0).length },
  { id: "projects", label: "Projects", icon: FolderKanban, count: (d) => (d.projects || []).filter((p) => p.title).length },
  { id: "certifications", label: "Certifications", icon: Award, count: (d) => d.certifications.filter((c) => c.name).length },
];

interface SectionNavigatorProps {
  data: ResumeJSON;
  activeSection: SectionId;
  sectionOrder: SectionId[];
  onSelect: (id: SectionId) => void;
  onReorder: (order: SectionId[]) => void;
}

export function SectionNavigator({ data, activeSection, sectionOrder, onSelect, onReorder }: SectionNavigatorProps) {
  const ordered = sectionOrder
    .map((id) => SECTIONS.find((s) => s.id === id)!)
    .filter(Boolean);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData("text/plain", String(idx));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    const sourceIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(sourceIdx) || sourceIdx === targetIdx) return;
    const newOrder = [...sectionOrder];
    const [moved] = newOrder.splice(sourceIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    onReorder(newOrder);
  };

  return (
    <div className="flex flex-col gap-1.5 p-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
        Sections
      </h3>
      {ordered.map((section, idx) => {
        const Icon = section.icon;
        const count = section.count(data);
        const isActive = activeSection === section.id;

        return (
          <button
            key={section.id}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, idx)}
            onClick={() => onSelect(section.id)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left w-full group",
              isActive
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
              isActive ? "bg-primary/15" : "bg-muted/50"
            )}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="flex-1 truncate">{section.label}</span>
            {count !== null && count > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
