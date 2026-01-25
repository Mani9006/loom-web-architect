import { ResumeData } from "@/types/resume";
import { Loader2 } from "lucide-react";

interface ResumePreviewProps {
  data: ResumeData;
  isGenerating?: boolean;
}

export function ResumePreview({ data, isGenerating }: ResumePreviewProps) {
  const isCreativeTemplate = data.templateId === "creative";

  return (
    <div className="h-full overflow-hidden p-6">
      <div className="bg-white text-black rounded-lg shadow-xl max-w-[800px] mx-auto relative">
        {/* Resume Content - Mimics actual resume layout */}
        <div className="p-8 space-y-6 text-sm leading-relaxed" style={{ fontFamily: "'Times New Roman', serif" }}>
          {/* Header */}
          <header className="text-center border-b border-gray-300 pb-4">
            <h1 className="text-2xl font-bold tracking-wide uppercase">{data.personalInfo.fullName || "Your Name"}</h1>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-gray-600 text-xs">
              {data.personalInfo.phone && <span>📞 {data.personalInfo.phone}</span>}
              {data.personalInfo.email && <span>✉️ {data.personalInfo.email}</span>}
              {data.personalInfo.linkedin && <span>🔗 {data.personalInfo.linkedin}</span>}
              {data.personalInfo.location && <span>📍 {data.personalInfo.location}</span>}
            </div>
          </header>

          {/* Summary - Only for professional template */}
          {!isCreativeTemplate && data.summary && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider border-b border-gray-300 pb-1 mb-2">Summary</h2>
              <p className="text-gray-700 text-xs leading-relaxed">{data.summary}</p>
              {data.totalYearsExperience > 0 && (
                <p className="text-gray-600 text-xs mt-1 italic">
                  Total Experience: {data.totalYearsExperience}+ years
                </p>
              )}
            </section>
          )}

          {/* Experience */}
          {data.clients.length > 0 && data.clients.some(c => c.name) && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider border-b border-gray-300 pb-1 mb-3">Experience</h2>
              <div className="space-y-4">
                {data.clients.filter(c => c.name).map((client) => {
                  const selectedProject = client.projects.find(p => p.isSelected);
                  return (
                    <div key={client.id}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-xs">{client.role || "Role"}</h3>
                          <p className="text-gray-600 text-xs">{client.name}{client.location && `, ${client.location}`}</p>
                        </div>
                        <span className="text-gray-500 text-xs whitespace-nowrap">
                          {client.startDate || "Start"} – {client.isCurrent ? "Present" : client.endDate || "End"}
                        </span>
                      </div>
                      {selectedProject && selectedProject.bullets.length > 0 && (
                        <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-gray-700">
                          {selectedProject.bullets.map((bullet, idx) => (
                            <li key={idx}>{bullet}</li>
                          ))}
                        </ul>
                      )}
                      {!selectedProject && client.responsibilities && (
                        <p className="mt-1 text-xs text-gray-600 italic">
                          {client.responsibilities}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Education */}
          {data.education.length > 0 && data.education.some(e => e.school) && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider border-b border-gray-300 pb-1 mb-3">Education</h2>
              <div className="space-y-2">
                {data.education.filter(e => e.school).map((edu) => (
                  <div key={edu.id} className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-xs">
                        {edu.degree && edu.field ? `${edu.degree} in ${edu.field}` : edu.degree || edu.field || "Degree"}
                      </h3>
                      <p className="text-gray-600 text-xs">{edu.school}</p>
                    </div>
                    <span className="text-gray-500 text-xs">{edu.graduationDate}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Certifications - Only for professional template */}
          {!isCreativeTemplate && data.certifications.length > 0 && data.certifications.some(c => c.name) && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider border-b border-gray-300 pb-1 mb-2">Certifications</h2>
              <ul className="space-y-1 text-xs">
                {data.certifications.filter(c => c.name).map((cert) => (
                  <li key={cert.id} className="flex justify-between">
                    <span>{cert.name} – {cert.issuer}</span>
                    <span className="text-gray-500">{cert.date}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Skills */}
          {data.skillCategories.length > 0 && data.skillCategories.some(sc => sc.skills.length > 0) && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider border-b border-gray-300 pb-1 mb-2">Skills</h2>
              <div className="space-y-1 text-xs">
                {data.skillCategories.filter(sc => sc.skills.length > 0).map((sc, idx) => (
                  <div key={idx}>
                    <span className="font-semibold">{sc.category}: </span>
                    <span className="text-gray-700">{sc.skills.join(", ")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Generating Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-sm text-gray-600">Generating content...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
