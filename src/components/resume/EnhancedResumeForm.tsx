import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, Sparkles, Loader2, FileText, Briefcase, GraduationCap, Award, Wrench, Upload, FolderKanban } from "lucide-react";
import { ResumeJSON, ExperienceEntry, EducationEntry, CertificationEntry, ProjectEntry, DEFAULT_SKILL_CATEGORIES, createEmptyResumeJSON, getSkillCategoryLabel } from "@/types/resume";
import { TemplateSelector } from "./TemplateSelector";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { ResumeFormSkeleton } from "./ResumeFormSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Helper to format responsibilities as bullet points
function formatResponsibilitiesAsBullets(responsibilities: string | string[]): string[] {
  if (!responsibilities) return [];
  
  // If already an array, clean it
  if (Array.isArray(responsibilities)) {
    return responsibilities
      .filter(r => r && r.trim())
      .map(r => r.trim().replace(/^[•\-\*]\s*/, ''));
  }
  
  const text = String(responsibilities);
  
  // Split by newlines or bullet characters
  return text
    .split(/\n|(?=•)|(?=-)/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^[•\-\*]\s*/, ''));

}

// Robust JSON parser that handles common AI response issues
function parseAIResponse(content: string): Record<string, any> | null {
  // Remove markdown code blocks if present
  let cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  
  // Try to extract JSON object - find the outermost balanced braces
  let braceCount = 0;
  let startIdx = -1;
  let endIdx = -1;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        if (startIdx === -1) startIdx = i;
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && startIdx !== -1) {
          endIdx = i + 1;
          break;
        }
      }
    }
  }
  
  if (startIdx === -1 || endIdx === -1) {
    console.error("No balanced JSON object found. Content:", cleaned.substring(0, 200));
    return null;
  }
  
  let jsonString = cleaned.substring(startIdx, endIdx);
  
  // Attempt 1: Direct parse
  try {
    const result = JSON.parse(jsonString);
    console.log("Direct parse successful");
    return result;
  } catch (e1) {
    console.log("Direct parse failed:", (e1 as Error).message);
  }
  
  // Attempt 2: Fix common JSON issues
  try {
    let fixed = jsonString
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/:\s*true\s*([,}])/gi, ': true$1')
      .replace(/:\s*false\s*([,}])/gi, ': false$1');
    
    const result = JSON.parse(fixed);
    console.log("Fixed parse successful");
    return result;
  } catch (e2) {
    console.log("Fixed parse failed:", (e2 as Error).message);
  }
  
  // Attempt 3: More aggressive cleanup
  try {
    let aggressive = jsonString
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/,(\s*[}\]])/g, '$1');
    
    aggressive = aggressive.replace(/([^\\])\\([^"\\nrtbfu])/g, '$1\\\\$2');
    
    const result = JSON.parse(aggressive);
    console.log("Aggressive parse successful");
    return result;
  } catch (e3) {
    console.log("Aggressive parse failed:", (e3 as Error).message);
  }
  
  // Attempt 4: Extract key fields with regex
  console.log("Attempting targeted field extraction...");
  try {
    const result: Record<string, any> = {
      header: { name: '', title: '', email: '', phone: '', location: '', linkedin: '' },
      experience: [],
      education: [],
      certifications: [],
      skills: {},
      summary: '',
    };
    
    const extractField = (pattern: RegExp): string => {
      const match = content.match(pattern);
      return match ? match[1].trim() : '';
    };
    
    // Extract header fields
    result.header.name = extractField(/"name"\s*:\s*"([^"]+)"/);
    result.header.email = extractField(/"email"\s*:\s*"([^"]+)"/);
    result.header.phone = extractField(/"phone"\s*:\s*"([^"]+)"/);
    result.header.location = extractField(/"location"\s*:\s*"([^"]+)"/);
    result.header.linkedin = extractField(/"linkedin"\s*:\s*"([^"]*)"/);
    result.header.title = extractField(/"title"\s*:\s*"([^"]+)"/);
    
    // Extract summary
    const summaryMatch = content.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (summaryMatch) {
      result.summary = summaryMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
    }
    
    // Extract arrays
    const extractArray = (key: string): any[] => {
      const regex = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\](?=\\s*,\\s*"|\\s*})`, 'i');
      const match = content.match(regex);
      if (match) {
        try {
          return JSON.parse('[' + match[1] + ']');
        } catch {
          console.log(`Failed to parse ${key} array`);
        }
      }
      return [];
    };
    
    result.experience = extractArray('experience');
    result.education = extractArray('education');
    result.certifications = extractArray('certifications');
    
    // Extract skills object
    const skillsMatch = content.match(/"skills"\s*:\s*(\{[\s\S]*?\})(?=\s*,\s*"|$)/);
    if (skillsMatch) {
      try {
        result.skills = JSON.parse(skillsMatch[1]);
      } catch {
        console.log("Failed to parse skills object");
      }
    }
    
    const hasData = result.header.name || 
                    result.header.email || 
                    result.experience.length > 0 ||
                    Object.keys(result.skills).length > 0;
    
    if (hasData) {
      console.log("Targeted extraction successful:", {
        name: result.header.name,
        email: result.header.email,
        experience: result.experience.length,
      });
      return result;
    }
  } catch (e4) {
    console.error("Targeted extraction failed:", e4);
  }
  
  console.error("All parsing attempts failed");
  return null;
}

interface EnhancedResumeFormProps {
  data: ResumeJSON;
  onChange: (data: ResumeJSON) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function EnhancedResumeForm({ data, onChange, onGenerate, isGenerating }: EnhancedResumeFormProps) {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("professional");
  const [skillInput, setSkillInput] = useState("");
  const [currentSkillCategory, setCurrentSkillCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isParsingResume, setIsParsingResume] = useState(false);
  const { toast } = useToast();

  // Handle imported resume text - parse it with AI to extract structured data
  const handleResumeImported = async (text: string, fileName: string) => {
    setIsParsingResume(true);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error("Not authenticated");
      }

      // Call AI to parse the resume text into structured data
      // System prompt is now defined server-side for mode "resume_parse"
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: `Parse this resume:\n\n${text}`
              }
            ],
            mode: "resume_parse",
            agentHint: "resume_parse",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to parse resume");
      }

      // Read the streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const parsed = JSON.parse(line.slice(6));
                const content = parsed.choices?.[0]?.delta?.content || 
                               parsed.choices?.[0]?.message?.content ||
                               parsed.content ||
                               parsed.text;
                if (content) fullContent += content;
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }

      console.log("Full AI response received, length:", fullContent.length);

      // Parse the JSON from the response
      const parsedData = parseAIResponse(fullContent);
      
      if (!parsedData) {
        throw new Error("Could not extract structured data from resume. Please try again.");
      }

      // Map parsed data to ResumeJSON structure
      const newData: ResumeJSON = {
        header: {
          name: parsedData.header?.name || data.header.name,
          title: parsedData.header?.title || data.header.title,
          email: parsedData.header?.email || data.header.email,
          phone: parsedData.header?.phone || data.header.phone,
          location: parsedData.header?.location || data.header.location,
          linkedin: parsedData.header?.linkedin || data.header.linkedin,
        },
        summary: parsedData.summary || data.summary,
        experience: parsedData.experience?.length > 0 
          ? parsedData.experience.map((e: any) => ({
              id: crypto.randomUUID(),
              role: e.role || "",
              company_or_client: e.company_or_client || "",
              start_date: e.start_date || "",
              end_date: e.end_date || "",
              location: e.location || "",
              bullets: Array.isArray(e.bullets) ? e.bullets : formatResponsibilitiesAsBullets(e.bullets || ""),
            }))
          : data.experience,
        education: parsedData.education?.length > 0
          ? parsedData.education.map((e: any) => ({
              id: crypto.randomUUID(),
              degree: e.degree || "",
              field: e.field || "",
              institution: e.institution || "",
              gpa: e.gpa || "",
              graduation_date: e.graduation_date || "",
              location: e.location || "",
            }))
          : data.education,
        certifications: parsedData.certifications?.length > 0
          ? parsedData.certifications.map((c: any) => ({
              id: crypto.randomUUID(),
              name: c.name || "",
              issuer: c.issuer || "",
              date: c.date || "",
            }))
          : data.certifications,
        skills: {
          ...data.skills,
          ...parsedData.skills,
        },
        projects: parsedData.projects?.length > 0
          ? parsedData.projects.map((p: any) => ({
              id: crypto.randomUUID(),
              title: p.title || "",
              organization: p.organization || "",
              date: p.date || "",
              bullets: Array.isArray(p.bullets) ? p.bullets : [],
            }))
          : data.projects,
      };

      onChange(newData);
      
      toast({
        title: "Resume imported!",
        description: `Successfully extracted data from ${fileName}. Review and edit as needed.`,
      });

    } catch (error) {
      console.error("Resume parsing error:", error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to parse resume",
        variant: "destructive",
      });
    } finally {
      setIsParsingResume(false);
    }
  };

  const updateHeader = (field: keyof ResumeJSON["header"], value: string) => {
    onChange({
      ...data,
      header: { ...data.header, [field]: value },
    });
  };

  const addExperience = () => {
    const newExp: ExperienceEntry = {
      id: crypto.randomUUID(),
      role: "",
      company_or_client: "",
      start_date: "",
      end_date: "",
      location: "",
      bullets: [],
    };
    onChange({ ...data, experience: [...data.experience, newExp] });
  };

  const removeExperience = (id: string) => {
    onChange({ ...data, experience: data.experience.filter((e) => e.id !== id) });
  };

  const updateExperience = (id: string, field: keyof ExperienceEntry, value: any) => {
    onChange({
      ...data,
      experience: data.experience.map((e) =>
        e.id === id ? { ...e, [field]: value } : e
      ),
    });
  };

  const addEducation = () => {
    const newEdu: EducationEntry = {
      id: crypto.randomUUID(),
      degree: "",
      field: "",
      institution: "",
      gpa: "",
      graduation_date: "",
      location: "",
    };
    onChange({ ...data, education: [...data.education, newEdu] });
  };

  const removeEducation = (id: string) => {
    onChange({ ...data, education: data.education.filter((e) => e.id !== id) });
  };

  const updateEducation = (id: string, field: keyof EducationEntry, value: string) => {
    onChange({
      ...data,
      education: data.education.map((e) =>
        e.id === id ? { ...e, [field]: value } : e
      ),
    });
  };

  const addCertification = () => {
    const newCert: CertificationEntry = {
      id: crypto.randomUUID(),
      name: "",
      issuer: "",
      date: "",
    };
    onChange({ ...data, certifications: [...data.certifications, newCert] });
  };

  const removeCertification = (id: string) => {
    onChange({ ...data, certifications: data.certifications.filter((c) => c.id !== id) });
  };

  const updateCertification = (id: string, field: keyof CertificationEntry, value: string) => {
    onChange({
      ...data,
      certifications: data.certifications.map((c) =>
        c.id === id ? { ...c, [field]: value } : c
      ),
    });
  };

  const addSkillToCategory = (category: string, skill: string) => {
    if (!skill.trim()) return;
    const currentSkills = data.skills[category] || [];
    if (!currentSkills.includes(skill.trim())) {
      onChange({
        ...data,
        skills: {
          ...data.skills,
          [category]: [...currentSkills, skill.trim()],
        },
      });
    }
  };

  const removeSkillFromCategory = (category: string, skill: string) => {
    onChange({
      ...data,
      skills: {
        ...data.skills,
        [category]: (data.skills[category] || []).filter((s) => s !== skill),
      },
    });
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    setShowTemplateSelector(false);
  };

  const isFormValid =
    data.header.name.trim() &&
    data.header.email.trim() &&
    data.experience.some((e) => e.company_or_client.trim() && e.role.trim());

  // Get non-empty skill categories for display
  const activeSkillCategories = DEFAULT_SKILL_CATEGORIES.filter(
    cat => (data.skills[cat] || []).length > 0
  );

  return (
    <>
      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
        selectedTemplateId={selectedTemplate}
      />

      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-24">
          {/* Import Existing Resume */}
          <Card className="border-border bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" /> Import Existing Resume
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground mb-3">
                Upload your PDF or Word resume and AI will auto-fill the form
              </p>
              <DocumentUpload
                onTextExtracted={handleResumeImported}
                isLoading={isParsingResume}
                persistToDocuments={true}
                label={isParsingResume ? "Parsing resume..." : "Upload Resume (PDF/Word)"}
              />
            </CardContent>
          </Card>

          {/* Show skeleton while parsing */}
          {isParsingResume && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI is extracting your resume data...</span>
              </div>
              <ResumeFormSkeleton />
            </div>
          )}

          {/* Hide form fields while parsing */}
          <div className={isParsingResume ? "opacity-0 h-0 overflow-hidden" : "space-y-4 animate-fade-in"}>
            {/* Template Selection Button */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTemplateSelector(true)}
              className="w-full justify-start gap-2 h-12"
            >
              <FileText className="h-4 w-4" />
              Template: {selectedTemplate === "creative" ? "Creative" : "Professional"}
              <span className="ml-auto text-muted-foreground">Change →</span>
            </Button>

            {/* Personal Information / Header */}
            <Card className="border-border">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  👤 Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Full Name *</Label>
                    <Input
                      placeholder="John Doe"
                      value={data.header.name}
                      onChange={(e) => updateHeader("name", e.target.value)}
                      className="bg-background h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Job Title</Label>
                    <Input
                      placeholder="Data Engineer"
                      value={data.header.title}
                      onChange={(e) => updateHeader("title", e.target.value)}
                      className="bg-background h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input
                      type="email"
                      placeholder="john@email.com"
                      value={data.header.email}
                      onChange={(e) => updateHeader("email", e.target.value)}
                      className="bg-background h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      placeholder="+1 555-123-4567"
                      value={data.header.phone}
                      onChange={(e) => updateHeader("phone", e.target.value)}
                      className="bg-background h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Location</Label>
                    <Input
                      placeholder="Dallas, TX"
                      value={data.header.location}
                      onChange={(e) => updateHeader("location", e.target.value)}
                      className="bg-background h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">LinkedIn</Label>
                    <Input
                      placeholder="linkedin.com/in/johndoe"
                      value={data.header.linkedin}
                      onChange={(e) => updateHeader("linkedin", e.target.value)}
                      className="bg-background h-9 text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary */}
            <Card className="border-border">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  📝 Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Textarea
                  placeholder="Brief professional summary highlighting your experience and skills..."
                  value={data.summary}
                  onChange={(e) => onChange({ ...data, summary: e.target.value })}
                  className="bg-background text-sm min-h-[80px]"
                />
              </CardContent>
            </Card>

            {/* Experience */}
            <Card className="border-border">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" /> Experience
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={addExperience} className="h-7 text-xs gap-1">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {data.experience.map((exp, index) => (
                  <div key={exp.id} className="p-3 bg-muted/50 rounded-lg space-y-3 relative">
                    {data.experience.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExperience(exp.id)}
                        className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <p className="text-xs font-medium text-muted-foreground">Experience {index + 1}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Company/Client *</Label>
                        <Input
                          placeholder="Company Inc."
                          value={exp.company_or_client}
                          onChange={(e) => updateExperience(exp.id, "company_or_client", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Role *</Label>
                        <Input
                          placeholder="Data Engineer"
                          value={exp.role}
                          onChange={(e) => updateExperience(exp.id, "role", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Start Date</Label>
                        <Input
                          placeholder="Feb 2024"
                          value={exp.start_date}
                          onChange={(e) => updateExperience(exp.id, "start_date", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">End Date</Label>
                        <Input
                          placeholder="Present"
                          value={exp.end_date}
                          onChange={(e) => updateExperience(exp.id, "end_date", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs">Location</Label>
                        <Input
                          placeholder="Dallas, TX"
                          value={exp.location}
                          onChange={(e) => updateExperience(exp.id, "location", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bullet Points (one per line)</Label>
                      <Textarea
                        placeholder="• Designed ETL pipelines using Python and SQL&#10;• Led data migration efforts&#10;• Developed automated quality checks"
                        value={exp.bullets.join('\n')}
                        onChange={(e) => updateExperience(exp.id, "bullets", e.target.value.split('\n').filter(b => b.trim()))}
                        className="bg-background text-sm min-h-[80px]"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Education */}
            <Card className="border-border">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" /> Education
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={addEducation} className="h-7 text-xs gap-1">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {data.education.map((edu, index) => (
                  <div key={edu.id} className="p-3 bg-muted/50 rounded-lg space-y-2 relative">
                    {data.education.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEducation(edu.id)}
                        className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Institution</Label>
                        <Input
                          placeholder="University of..."
                          value={edu.institution}
                          onChange={(e) => updateEducation(edu.id, "institution", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Degree</Label>
                        <Input
                          placeholder="Master's, Bachelor's"
                          value={edu.degree}
                          onChange={(e) => updateEducation(edu.id, "degree", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Field</Label>
                        <Input
                          placeholder="Computer Science"
                          value={edu.field}
                          onChange={(e) => updateEducation(edu.id, "field", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Graduation Date</Label>
                        <Input
                          placeholder="May 2023"
                          value={edu.graduation_date}
                          onChange={(e) => updateEducation(edu.id, "graduation_date", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Certifications */}
            <Card className="border-border">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Award className="h-4 w-4" /> Certifications
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={addCertification} className="h-7 text-xs gap-1">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {data.certifications.map((cert) => (
                  <div key={cert.id} className="p-3 bg-muted/50 rounded-lg space-y-2 relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCertification(cert.id)}
                      className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs">Certification Name</Label>
                        <Input
                          placeholder="AWS Certified..."
                          value={cert.name}
                          onChange={(e) => updateCertification(cert.id, "name", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Date</Label>
                        <Input
                          placeholder="Sep 2024"
                          value={cert.date}
                          onChange={(e) => updateCertification(cert.id, "date", e.target.value)}
                          className="bg-background h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Issuer</Label>
                      <Input
                        placeholder="Amazon Web Services"
                        value={cert.issuer}
                        onChange={(e) => updateCertification(cert.id, "issuer", e.target.value)}
                        className="bg-background h-8 text-sm"
                      />
                    </div>
                  </div>
                ))}
                {data.certifications.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No certifications added yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Skills */}
            <Card className="border-border">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Skills
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {/* Show all skill categories (both with skills and empty user-added ones) */}
                {Object.entries(data.skills).map(([categoryKey, skills]) => (
                  <div key={categoryKey} className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {getSkillCategoryLabel(categoryKey)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newSkills = { ...data.skills };
                          delete newSkills[categoryKey];
                          onChange({ ...data, skills: newSkills });
                        }}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder={`Add skill...`}
                        value={currentSkillCategory === categoryKey ? skillInput : ""}
                        onChange={(e) => {
                          setCurrentSkillCategory(categoryKey);
                          setSkillInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSkillToCategory(categoryKey, skillInput);
                            setSkillInput("");
                          }
                        }}
                        className="bg-background h-8 text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          addSkillToCategory(categoryKey, skillInput);
                          setSkillInput("");
                        }}
                        className="h-8"
                      >
                        Add
                      </Button>
                    </div>
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {skills.map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
                          >
                            {skill}
                            <button type="button" onClick={() => removeSkillFromCategory(categoryKey, skill)}>
                              <X className="h-2 w-2" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {/* Add new category section */}
                <div className="p-3 border-2 border-dashed border-muted rounded-lg space-y-2">
                  <span className="text-sm text-muted-foreground">Add New Skill Category</span>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Category name (e.g., Cloud Platforms)"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="bg-background h-8 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (newCategoryName.trim()) {
                          const categoryKey = newCategoryName.trim().toLowerCase().replace(/\s+/g, '_').replace(/&/g, '');
                          if (!data.skills[categoryKey]) {
                            onChange({
                              ...data,
                              skills: {
                                ...data.skills,
                                [categoryKey]: [],
                              },
                            });
                          }
                          setNewCategoryName("");
                        }
                      }}
                      className="h-8"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Empty state */}
                {Object.keys(data.skills).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No skills added yet. Upload a resume to parse skills or add categories manually above.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Projects Section */}
            <Card className="border-muted">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  Projects
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {data.projects.map((project, index) => (
                  <div key={project.id} className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-muted-foreground">Project {index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onChange({
                            ...data,
                            projects: data.projects.filter((_, i) => i !== index),
                          });
                        }}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid gap-3">
                      <div>
                        <Label className="text-xs">Project Name</Label>
                        <Input
                          value={project.title}
                          onChange={(e) => {
                            const updated = [...data.projects];
                            updated[index] = { ...project, title: e.target.value };
                            onChange({ ...data, projects: updated });
                          }}
                          placeholder="e.g., AI-Powered Chatbot"
                          className="h-9"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">College/University</Label>
                          <Input
                            value={project.organization}
                            onChange={(e) => {
                              const updated = [...data.projects];
                              updated[index] = { ...project, organization: e.target.value };
                              onChange({ ...data, projects: updated });
                            }}
                            placeholder="e.g., MIT"
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Month & Year</Label>
                          <Input
                            value={project.date}
                            onChange={(e) => {
                              const updated = [...data.projects];
                              updated[index] = { ...project, date: e.target.value };
                              onChange({ ...data, projects: updated });
                            }}
                            placeholder="e.g., May 2024"
                            className="h-9"
                          />
                        </div>
                      </div>
                      
                      {/* Project Bullets */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <Label className="text-xs">Key Points</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = [...data.projects];
                              updated[index] = { ...project, bullets: [...project.bullets, ""] };
                              onChange({ ...data, projects: updated });
                            }}
                            className="h-6 text-xs gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Add Point
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {project.bullets.map((bullet, bulletIdx) => (
                            <div key={bulletIdx} className="flex gap-2">
                              <span className="text-muted-foreground mt-2">•</span>
                              <Textarea
                                value={bullet}
                                onChange={(e) => {
                                  const updated = [...data.projects];
                                  const newBullets = [...project.bullets];
                                  newBullets[bulletIdx] = e.target.value;
                                  updated[index] = { ...project, bullets: newBullets };
                                  onChange({ ...data, projects: updated });
                                }}
                                placeholder="Describe what you built, technologies used, and impact..."
                                className="min-h-[60px] text-sm"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updated = [...data.projects];
                                  const newBullets = project.bullets.filter((_, i) => i !== bulletIdx);
                                  updated[index] = { ...project, bullets: newBullets };
                                  onChange({ ...data, projects: updated });
                                }}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          {project.bullets.length === 0 && (
                            <p className="text-xs text-muted-foreground">Click "Add Point" to add project details</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Add Project Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newProject: ProjectEntry = {
                      id: crypto.randomUUID(),
                      title: "",
                      organization: "",
                      date: "",
                      bullets: [""],
                    };
                    onChange({
                      ...data,
                      projects: [...data.projects, newProject],
                    });
                  }}
                  className="w-full gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Project
                </Button>
                
                {/* Empty state */}
                {data.projects.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No projects added yet. Upload a resume to parse projects or add them manually.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>

      {/* Fixed Generate Button */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <Button
          onClick={onGenerate}
          disabled={!isFormValid || isGenerating || isParsingResume}
          className="w-full h-12 text-base gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Generate AI Resume
            </>
          )}
        </Button>
      </div>
    </>
  );
}
