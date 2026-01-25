import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Sparkles, Loader2 } from "lucide-react";

export interface ResumeData {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    portfolio?: string;
  };
  experience: {
    id: string;
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
  }[];
  education: {
    id: string;
    school: string;
    degree: string;
    field: string;
    graduationDate: string;
  }[];
  skills: string[];
  targetRole?: string;
}

interface ResumeFormProps {
  onGenerate: (data: ResumeData) => void;
  isGenerating: boolean;
}

export function ResumeForm({ onGenerate, isGenerating }: ResumeFormProps) {
  const [formData, setFormData] = useState<ResumeData>({
    personalInfo: {
      fullName: "",
      email: "",
      phone: "",
      location: "",
      linkedin: "",
      portfolio: "",
    },
    experience: [
      { id: crypto.randomUUID(), company: "", title: "", startDate: "", endDate: "", isCurrent: false },
    ],
    education: [
      { id: crypto.randomUUID(), school: "", degree: "", field: "", graduationDate: "" },
    ],
    skills: [],
    targetRole: "",
  });

  const [skillInput, setSkillInput] = useState("");

  const updatePersonalInfo = (field: keyof ResumeData["personalInfo"], value: string) => {
    setFormData((prev) => ({
      ...prev,
      personalInfo: { ...prev.personalInfo, [field]: value },
    }));
  };

  const addExperience = () => {
    setFormData((prev) => ({
      ...prev,
      experience: [
        ...prev.experience,
        { id: crypto.randomUUID(), company: "", title: "", startDate: "", endDate: "", isCurrent: false },
      ],
    }));
  };

  const removeExperience = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      experience: prev.experience.filter((exp) => exp.id !== id),
    }));
  };

  const updateExperience = (id: string, field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      experience: prev.experience.map((exp) =>
        exp.id === id ? { ...exp, [field]: value } : exp
      ),
    }));
  };

  const addEducation = () => {
    setFormData((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        { id: crypto.randomUUID(), school: "", degree: "", field: "", graduationDate: "" },
      ],
    }));
  };

  const removeEducation = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      education: prev.education.filter((edu) => edu.id !== id),
    }));
  };

  const updateEducation = (id: string, field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      education: prev.education.map((edu) =>
        edu.id === id ? { ...edu, [field]: value } : edu
      ),
    }));
  };

  const addSkill = () => {
    if (skillInput.trim() && !formData.skills.includes(skillInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        skills: [...prev.skills, skillInput.trim()],
      }));
      setSkillInput("");
    }
  };

  const removeSkill = (skill: string) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skill),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(formData);
  };

  const isFormValid =
    formData.personalInfo.fullName.trim() &&
    formData.personalInfo.email.trim() &&
    formData.experience.some((exp) => exp.company.trim() && exp.title.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto p-4 pb-8">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold mb-2">AI Resume Builder</h1>
        <p className="text-muted-foreground">
          Enter your details and let AI craft compelling bullet points for your resume
        </p>
      </div>

      {/* Target Role */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            🎯 Target Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="e.g., Senior Software Engineer, Product Manager, Data Scientist"
            value={formData.targetRole}
            onChange={(e) => setFormData((prev) => ({ ...prev, targetRole: e.target.value }))}
            className="bg-background"
          />
          <p className="text-xs text-muted-foreground mt-2">
            AI will tailor your resume content for this role
          </p>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            👤 Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                value={formData.personalInfo.fullName}
                onChange={(e) => updatePersonalInfo("fullName", e.target.value)}
                className="bg-background"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={formData.personalInfo.email}
                onChange={(e) => updatePersonalInfo("email", e.target.value)}
                className="bg-background"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="+1 (555) 123-4567"
                value={formData.personalInfo.phone}
                onChange={(e) => updatePersonalInfo("phone", e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="San Francisco, CA"
                value={formData.personalInfo.location}
                onChange={(e) => updatePersonalInfo("location", e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn URL</Label>
              <Input
                id="linkedin"
                placeholder="linkedin.com/in/johndoe"
                value={formData.personalInfo.linkedin}
                onChange={(e) => updatePersonalInfo("linkedin", e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio">Portfolio/Website</Label>
              <Input
                id="portfolio"
                placeholder="johndoe.com"
                value={formData.personalInfo.portfolio}
                onChange={(e) => updatePersonalInfo("portfolio", e.target.value)}
                className="bg-background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work Experience */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">💼 Work Experience</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addExperience}
              className="gap-1"
            >
              <Plus className="w-4 h-4" /> Add
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {formData.experience.map((exp, index) => (
            <div key={exp.id} className="space-y-4 p-4 bg-muted/50 rounded-lg relative">
              {formData.experience.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeExperience(exp.id)}
                  className="absolute top-2 right-2 w-6 h-6 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              <p className="text-sm font-medium text-muted-foreground">Position {index + 1}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Name *</Label>
                  <Input
                    placeholder="Google"
                    value={exp.company}
                    onChange={(e) => updateExperience(exp.id, "company", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Job Title *</Label>
                  <Input
                    placeholder="Software Engineer"
                    value={exp.title}
                    onChange={(e) => updateExperience(exp.id, "title", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    placeholder="Jan 2022"
                    value={exp.startDate}
                    onChange={(e) => updateExperience(exp.id, "startDate", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    placeholder="Present"
                    value={exp.endDate}
                    onChange={(e) => updateExperience(exp.id, "endDate", e.target.value)}
                    className="bg-background"
                    disabled={exp.isCurrent}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`current-${exp.id}`}
                  checked={exp.isCurrent}
                  onChange={(e) => {
                    updateExperience(exp.id, "isCurrent", e.target.checked);
                    if (e.target.checked) {
                      updateExperience(exp.id, "endDate", "Present");
                    }
                  }}
                  className="w-4 h-4 rounded border-border"
                />
                <Label htmlFor={`current-${exp.id}`} className="text-sm">
                  I currently work here
                </Label>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            💡 Don't worry about bullet points - AI will generate them based on your role and company
          </p>
        </CardContent>
      </Card>

      {/* Education */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">🎓 Education</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addEducation}
              className="gap-1"
            >
              <Plus className="w-4 h-4" /> Add
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {formData.education.map((edu, index) => (
            <div key={edu.id} className="space-y-4 p-4 bg-muted/50 rounded-lg relative">
              {formData.education.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEducation(edu.id)}
                  className="absolute top-2 right-2 w-6 h-6 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              <p className="text-sm font-medium text-muted-foreground">Education {index + 1}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>School/University</Label>
                  <Input
                    placeholder="Stanford University"
                    value={edu.school}
                    onChange={(e) => updateEducation(edu.id, "school", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Degree</Label>
                  <Input
                    placeholder="Bachelor's, Master's, PhD"
                    value={edu.degree}
                    onChange={(e) => updateEducation(edu.id, "degree", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Field of Study</Label>
                  <Input
                    placeholder="Computer Science"
                    value={edu.field}
                    onChange={(e) => updateEducation(edu.id, "field", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Graduation Date</Label>
                  <Input
                    placeholder="May 2020"
                    value={edu.graduationDate}
                    onChange={(e) => updateEducation(edu.id, "graduationDate", e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Skills */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            🛠️ Skills
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add a skill (e.g., Python, Project Management)"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
              className="bg-background"
            />
            <Button type="button" variant="outline" onClick={addSkill}>
              Add
            </Button>
          </div>
          {formData.skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Button
        type="submit"
        size="lg"
        disabled={!isFormValid || isGenerating}
        className="w-full h-14 text-lg gap-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:opacity-90 transition-opacity"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating Resume...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generate AI Resume
          </>
        )}
      </Button>
    </form>
  );
}
