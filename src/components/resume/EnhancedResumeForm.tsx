import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, Sparkles, Loader2, FileText, Briefcase, GraduationCap, Award, Wrench } from "lucide-react";
import { ResumeData, Client, Education, Certification, SkillCategory } from "@/types/resume";
import { TemplateSelector } from "./TemplateSelector";

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
      </ScrollArea>

      {/* Fixed Generate Button */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <Button
          onClick={onGenerate}
          disabled={!isFormValid || isGenerating}
          className="w-full h-12 text-base gap-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:opacity-90"
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
