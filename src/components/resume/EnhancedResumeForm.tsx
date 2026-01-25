import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, Sparkles, Loader2, FileText, Briefcase, GraduationCap, Award, Wrench, Upload } from "lucide-react";
import { ResumeData, Client, Education, Certification, SkillCategory } from "@/types/resume";
import { TemplateSelector } from "./TemplateSelector";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { ResumeFormSkeleton } from "./ResumeFormSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Robust JSON parser that handles common AI response issues
function parseAIResponse(content: string): Record<string, any> | null {
  // Remove markdown code blocks if present
  let cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  
  // Try to extract JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("No JSON object found in response:", content.substring(0, 200));
    return null;
  }
  
  let jsonString = jsonMatch[0];
  
  // Attempt 1: Direct parse
  try {
    return JSON.parse(jsonString);
  } catch (e1) {
    console.log("Direct parse failed, attempting cleanup...");
  }
  
  // Attempt 2: Fix common issues
  try {
    // Replace problematic characters
    jsonString = jsonString
      // Fix unescaped newlines in strings
      .replace(/(?<!\\)\n/g, '\\n')
      // Fix unescaped tabs
      .replace(/(?<!\\)\t/g, '\\t')
      // Fix trailing commas before closing brackets
      .replace(/,\s*([}\]])/g, '$1')
      // Fix single quotes (convert to double)
      .replace(/'/g, '"');
    
    return JSON.parse(jsonString);
  } catch (e2) {
    console.log("Cleanup parse failed, attempting regex extraction...");
  }
  
  // Attempt 3: Try to extract fields manually and rebuild
  try {
    const result: Record<string, any> = {
      personalInfo: { fullName: '', email: '', phone: '', location: '', linkedin: '', portfolio: '', title: '' },
      clients: [],
      education: [],
      certifications: [],
      skillCategories: [],
      summary: '',
      targetRole: ''
    };
    
    // Extract personal info fields
    const nameMatch = content.match(/"fullName"\s*:\s*"([^"]*?)"/);
    if (nameMatch) result.personalInfo.fullName = nameMatch[1];
    
    const emailMatch = content.match(/"email"\s*:\s*"([^"]*?)"/);
    if (emailMatch) result.personalInfo.email = emailMatch[1];
    
    const phoneMatch = content.match(/"phone"\s*:\s*"([^"]*?)"/);
    if (phoneMatch) result.personalInfo.phone = phoneMatch[1];
    
    const locationMatch = content.match(/"location"\s*:\s*"([^"]*?)"/);
    if (locationMatch) result.personalInfo.location = locationMatch[1];
    
    const linkedinMatch = content.match(/"linkedin"\s*:\s*"([^"]*?)"/);
    if (linkedinMatch) result.personalInfo.linkedin = linkedinMatch[1];
    
    const titleMatch = content.match(/"title"\s*:\s*"([^"]*?)"/);
    if (titleMatch) result.personalInfo.title = titleMatch[1];
    
    // Extract summary (may contain special chars)
    const summaryMatch = content.match(/"summary"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/);
    if (summaryMatch) result.summary = summaryMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
    
    const targetMatch = content.match(/"targetRole"\s*:\s*"([^"]*?)"/);
    if (targetMatch) result.targetRole = targetMatch[1];
    
    // Try to parse arrays using a more lenient approach
    const clientsMatch = content.match(/"clients"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"education"|\s*,\s*"skillCategories"|\s*})/);
    if (clientsMatch) {
      try {
        // Clean and parse the clients array
        const clientsStr = clientsMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ');
        result.clients = JSON.parse(clientsStr);
      } catch { /* Use empty array */ }
    }
    
    const educationMatch = content.match(/"education"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"certifications"|\s*,\s*"skillCategories"|\s*})/);
    if (educationMatch) {
      try {
        const eduStr = educationMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ');
        result.education = JSON.parse(eduStr);
      } catch { /* Use empty array */ }
    }
    
    const certsMatch = content.match(/"certifications"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"skillCategories"|\s*,\s*"summary"|\s*})/);
    if (certsMatch) {
      try {
        const certsStr = certsMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ');
        result.certifications = JSON.parse(certsStr);
      } catch { /* Use empty array */ }
    }
    
    const skillsMatch = content.match(/"skillCategories"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"summary"|\s*,\s*"targetRole"|\s*})/);
    if (skillsMatch) {
      try {
        const skillsStr = skillsMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ');
        result.skillCategories = JSON.parse(skillsStr);
      } catch { /* Use empty array */ }
    }
    
    // Check if we extracted anything useful
    if (result.personalInfo.fullName || result.personalInfo.email || result.clients.length > 0) {
      console.log("Regex extraction successful:", result);
      return result;
    }
  } catch (e3) {
    console.error("Regex extraction failed:", e3);
  }
  
  console.error("All parsing attempts failed for content:", content.substring(0, 500));
  return null;
}
interface EnhancedResumeFormProps {
  data: ResumeData;
  onChange: (data: ResumeData) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function EnhancedResumeForm({ data, onChange, onGenerate, isGenerating }: EnhancedResumeFormProps) {
  const [showTemplateSelector, setShowTemplateSelector] = useState(!data.templateId);
  const [skillInput, setSkillInput] = useState("");
  const [currentSkillCategory, setCurrentSkillCategory] = useState("");
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
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are an expert resume parser. Your task is to extract ALL structured information from the resume text.

IMPORTANT RULES:
1. Extract EVERY piece of information you can find
2. For contact info: Look for email patterns, phone numbers (various formats), city/state locations, LinkedIn URLs
3. For experience: Extract EACH job with company name, job title, dates, and bullet points/responsibilities
4. For education: Extract school name, degree type (BS, MS, MBA, etc.), field of study, graduation date, GPA
5. For skills: Group skills into logical categories (Programming Languages, Frameworks, Cloud, Tools, etc.)
6. For certifications: Extract name, issuing organization, and date

Return ONLY a valid JSON object with NO markdown formatting, NO code blocks, just raw JSON:
{
  "personalInfo": {
    "fullName": "extracted full name",
    "email": "email@example.com",
    "phone": "+1 xxx-xxx-xxxx",
    "location": "City, State",
    "linkedin": "linkedin URL or profile",
    "portfolio": "website URL if any",
    "title": "current or target job title"
  },
  "clients": [
    {
      "name": "Company Name",
      "industry": "Industry if mentioned",
      "location": "Job location if mentioned",
      "role": "Job Title",
      "startDate": "Month Year",
      "endDate": "Month Year or Present",
      "isCurrent": true/false,
      "responsibilities": "Combined bullet points as paragraph or key achievements"
    }
  ],
  "education": [
    {
      "school": "University Name",
      "degree": "Bachelor of Science/Master of Science/etc",
      "field": "Field of Study (e.g., Computer Science)",
      "graduationDate": "Month Year or just Year",
      "gpa": "GPA if mentioned (e.g., 3.8)"
    }
  ],
  "certifications": [
    {
      "name": "Certification Full Name",
      "issuer": "Issuing Organization (AWS, Google, Microsoft, etc.)",
      "date": "Date obtained"
    }
  ],
  "skillCategories": [
    {
      "category": "Category Name",
      "skills": ["skill1", "skill2", "skill3"]
    }
  ],
  "summary": "Extract any professional summary or objective statement if present",
  "targetRole": "Inferred target role based on most recent experience and skills"
}

CRITICAL: Parse ALL experience entries, ALL education entries, ALL certifications. Do not skip any. For missing fields, use empty strings "". Return ONLY valid JSON.`
              },
              {
                role: "user",
                content: `Parse this resume and extract ALL information:\n\n${text}`
              }
            ],
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
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) fullContent += content;
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }

      // Parse the JSON from the response with robust error handling
      const parsedData = parseAIResponse(fullContent);
      
      if (!parsedData) {
        throw new Error("Could not extract structured data from resume. Please try again.");
      }

      // Update the form with parsed data
      const newData: ResumeData = {
        ...data,
        templateId: data.templateId || "professional",
        personalInfo: {
          fullName: parsedData.personalInfo?.fullName || data.personalInfo.fullName,
          email: parsedData.personalInfo?.email || data.personalInfo.email,
          phone: parsedData.personalInfo?.phone || data.personalInfo.phone,
          location: parsedData.personalInfo?.location || data.personalInfo.location,
          linkedin: parsedData.personalInfo?.linkedin || data.personalInfo.linkedin,
          portfolio: parsedData.personalInfo?.portfolio || data.personalInfo.portfolio,
          title: parsedData.personalInfo?.title || data.personalInfo.title,
        },
        targetRole: parsedData.targetRole || parsedData.personalInfo?.title || data.targetRole,
        clients: parsedData.clients?.length > 0 
          ? parsedData.clients.map((c: any) => ({
              id: crypto.randomUUID(),
              name: c.name || "",
              industry: c.industry || "",
              location: c.location || "",
              role: c.role || "",
              startDate: c.startDate || "",
              endDate: c.endDate || "",
              isCurrent: c.isCurrent || c.endDate?.toLowerCase()?.includes("present") || false,
              responsibilities: c.responsibilities || "",
              projects: [],
            }))
          : data.clients,
        education: parsedData.education?.length > 0
          ? parsedData.education.map((e: any) => ({
              id: crypto.randomUUID(),
              school: e.school || "",
              degree: e.degree || "",
              field: e.field || "",
              graduationDate: e.graduationDate || "",
              gpa: e.gpa || "",
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
        skillCategories: parsedData.skillCategories?.length > 0
          ? parsedData.skillCategories.map((s: any) => ({
              category: s.category || "",
              skills: Array.isArray(s.skills) ? s.skills : [],
            }))
          : data.skillCategories,
        summary: parsedData.summary || data.summary,
        summaryOptions: data.summaryOptions,
        totalYearsExperience: data.totalYearsExperience,
        projects: data.projects,
      };

      onChange(newData);
      
      console.log("Resume parsed successfully:", {
        personalInfo: newData.personalInfo,
        clients: newData.clients.length,
        education: newData.education.length,
        certifications: newData.certifications.length,
        skillCategories: newData.skillCategories.length,
      });

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

  const updatePersonalInfo = (field: keyof ResumeData["personalInfo"], value: string) => {
    onChange({
      ...data,
      personalInfo: { ...data.personalInfo, [field]: value },
    });
  };

  const addClient = () => {
    const newClient: Client = {
      id: crypto.randomUUID(),
      name: "",
      industry: "",
      location: "",
      role: "",
      startDate: "",
      endDate: "",
      isCurrent: false,
      responsibilities: "",
      projects: [],
    };
    onChange({ ...data, clients: [...data.clients, newClient] });
  };

  const removeClient = (id: string) => {
    onChange({ ...data, clients: data.clients.filter((c) => c.id !== id) });
  };

  const updateClient = (id: string, field: keyof Client, value: any) => {
    onChange({
      ...data,
      clients: data.clients.map((c) =>
        c.id === id ? { ...c, [field]: value } : c
      ),
    });
  };

  const addEducation = () => {
    const newEdu: Education = {
      id: crypto.randomUUID(),
      school: "",
      degree: "",
      field: "",
      graduationDate: "",
      gpa: "",
    };
    onChange({ ...data, education: [...data.education, newEdu] });
  };

  const removeEducation = (id: string) => {
    onChange({ ...data, education: data.education.filter((e) => e.id !== id) });
  };

  const updateEducation = (id: string, field: keyof Education, value: string) => {
    onChange({
      ...data,
      education: data.education.map((e) =>
        e.id === id ? { ...e, [field]: value } : e
      ),
    });
  };

  const addCertification = () => {
    const newCert: Certification = {
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

  const updateCertification = (id: string, field: keyof Certification, value: string) => {
    onChange({
      ...data,
      certifications: data.certifications.map((c) =>
        c.id === id ? { ...c, [field]: value } : c
      ),
    });
  };

  const addSkillCategory = () => {
    if (!currentSkillCategory.trim()) return;
    const newCategory: SkillCategory = {
      category: currentSkillCategory.trim(),
      skills: [],
    };
    onChange({ ...data, skillCategories: [...data.skillCategories, newCategory] });
    setCurrentSkillCategory("");
  };

  const removeSkillCategory = (index: number) => {
    onChange({
      ...data,
      skillCategories: data.skillCategories.filter((_, i) => i !== index),
    });
  };

  const addSkillToCategory = (categoryIndex: number, skill: string) => {
    if (!skill.trim()) return;
    const updated = [...data.skillCategories];
    if (!updated[categoryIndex].skills.includes(skill.trim())) {
      updated[categoryIndex].skills.push(skill.trim());
      onChange({ ...data, skillCategories: updated });
    }
  };

  const removeSkillFromCategory = (categoryIndex: number, skill: string) => {
    const updated = [...data.skillCategories];
    updated[categoryIndex].skills = updated[categoryIndex].skills.filter((s) => s !== skill);
    onChange({ ...data, skillCategories: updated });
  };

  const handleTemplateSelect = (templateId: string) => {
    onChange({ ...data, templateId });
    setShowTemplateSelector(false);
  };

  const isFormValid =
    data.templateId &&
    data.personalInfo.fullName.trim() &&
    data.personalInfo.email.trim() &&
    data.clients.some((c) => c.name.trim() && c.role.trim());

  return (
    <>
      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
        selectedTemplateId={data.templateId}
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

          {/* Hide form fields while parsing, show when done */}
          <div className={isParsingResume ? "opacity-0 h-0 overflow-hidden" : "space-y-4 animate-fade-in"}>
            {/* Template Selection Button */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTemplateSelector(true)}
              className="w-full justify-start gap-2 h-12"
            >
              <FileText className="h-4 w-4" />
              {data.templateId
                ? `Template: ${data.templateId === "creative" ? "Creative" : "Professional"}`
                : "Choose Template"}
              <span className="ml-auto text-muted-foreground">Change →</span>
            </Button>

            {/* Target Role */}
            <Card className="border-border">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  🎯 Target Role
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Input
                  placeholder="e.g., Senior ML Engineer, Data Scientist"
                  value={data.targetRole}
                  onChange={(e) => onChange({ ...data, targetRole: e.target.value })}
                  className="bg-background"
                />
              </CardContent>
            </Card>

          {/* Personal Information */}
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
                    value={data.personalInfo.fullName}
                    onChange={(e) => updatePersonalInfo("fullName", e.target.value)}
                    className="bg-background h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    placeholder="john@email.com"
                    value={data.personalInfo.email}
                    onChange={(e) => updatePersonalInfo("email", e.target.value)}
                    className="bg-background h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    placeholder="+1 555-123-4567"
                    value={data.personalInfo.phone}
                    onChange={(e) => updatePersonalInfo("phone", e.target.value)}
                    className="bg-background h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Location</Label>
                  <Input
                    placeholder="Dallas, TX"
                    value={data.personalInfo.location}
                    onChange={(e) => updatePersonalInfo("location", e.target.value)}
                    className="bg-background h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">LinkedIn</Label>
                  <Input
                    placeholder="linkedin.com/in/johndoe"
                    value={data.personalInfo.linkedin}
                    onChange={(e) => updatePersonalInfo("linkedin", e.target.value)}
                    className="bg-background h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Portfolio</Label>
                  <Input
                    placeholder="johndoe.com"
                    value={data.personalInfo.portfolio}
                    onChange={(e) => updatePersonalInfo("portfolio", e.target.value)}
                    className="bg-background h-9 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clients/Experience */}
          <Card className="border-border">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" /> Clients / Experience
                </span>
                <Button type="button" variant="outline" size="sm" onClick={addClient} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add Client
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {data.clients.map((client, index) => (
                <div key={client.id} className="p-3 bg-muted/50 rounded-lg space-y-3 relative">
                  {data.clients.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeClient(client.id)}
                      className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                  <p className="text-xs font-medium text-muted-foreground">Client {index + 1}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Client Name *</Label>
                      <Input
                        placeholder="Company Inc."
                        value={client.name}
                        onChange={(e) => updateClient(client.id, "name", e.target.value)}
                        className="bg-background h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Industry</Label>
                      <Input
                        placeholder="Banking, Retail, Tech..."
                        value={client.industry}
                        onChange={(e) => updateClient(client.id, "industry", e.target.value)}
                        className="bg-background h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Your Role *</Label>
                      <Input
                        placeholder="ML Engineer"
                        value={client.role}
                        onChange={(e) => updateClient(client.id, "role", e.target.value)}
                        className="bg-background h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Location</Label>
                      <Input
                        placeholder="Dallas, TX"
                        value={client.location}
                        onChange={(e) => updateClient(client.id, "location", e.target.value)}
                        className="bg-background h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Start Date</Label>
                      <Input
                        placeholder="Feb 2024"
                        value={client.startDate}
                        onChange={(e) => updateClient(client.id, "startDate", e.target.value)}
                        className="bg-background h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End Date</Label>
                      <Input
                        placeholder="Present"
                        value={client.endDate}
                        onChange={(e) => updateClient(client.id, "endDate", e.target.value)}
                        className="bg-background h-8 text-sm"
                        disabled={client.isCurrent}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`current-${client.id}`}
                      checked={client.isCurrent}
                      onChange={(e) => {
                        updateClient(client.id, "isCurrent", e.target.checked);
                        if (e.target.checked) updateClient(client.id, "endDate", "Present");
                      }}
                      className="h-3 w-3"
                    />
                    <Label htmlFor={`current-${client.id}`} className="text-xs">Currently working here</Label>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Key Responsibilities (optional)</Label>
                    <Textarea
                      placeholder="Briefly describe your work. AI will generate project bullets from this."
                      value={client.responsibilities}
                      onChange={(e) => updateClient(client.id, "responsibilities", e.target.value)}
                      className="bg-background text-sm min-h-[60px]"
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                💡 AI will generate 2 project options per client based on role, industry, and dates
              </p>
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
                      <Label className="text-xs">School</Label>
                      <Input
                        placeholder="University of..."
                        value={edu.school}
                        onChange={(e) => updateEducation(edu.id, "school", e.target.value)}
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
                      <Label className="text-xs">Graduation</Label>
                      <Input
                        placeholder="Jul '23"
                        value={edu.graduationDate}
                        onChange={(e) => updateEducation(edu.id, "graduationDate", e.target.value)}
                        className="bg-background h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Certifications - Only for professional template */}
          {data.templateId === "professional" && (
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
                          placeholder="Sep '24"
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
              </CardContent>
            </Card>
          )}

          {/* Skills */}
          <Card className="border-border">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {/* Add category */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add category (e.g., Programming Languages)"
                  value={currentSkillCategory}
                  onChange={(e) => setCurrentSkillCategory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkillCategory())}
                  className="bg-background h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addSkillCategory} className="h-8">
                  Add
                </Button>
              </div>

              {/* Skill categories */}
              {data.skillCategories.map((cat, catIndex) => (
                <div key={catIndex} className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{cat.category}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSkillCategory(catIndex)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={`Add skill to ${cat.category}`}
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSkillToCategory(catIndex, skillInput);
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
                        addSkillToCategory(catIndex, skillInput);
                        setSkillInput("");
                      }}
                      className="h-8"
                    >
                      Add
                    </Button>
                  </div>
                  {cat.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cat.skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
                        >
                          {skill}
                          <button type="button" onClick={() => removeSkillFromCategory(catIndex, skill)}>
                            <X className="h-2 w-2" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
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
