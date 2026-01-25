import { useCallback, useRef } from 'react';
import { ResumeData, SummaryOption, ProjectOption } from '@/types/resume';

interface ParseResult {
  summary?: string;
  summaryOptions?: SummaryOption[];
  experienceUpdates?: Array<{
    clientId: string;
    projects: ProjectOption[];
  }>;
  personalInfo?: Partial<ResumeData['personalInfo']>;
  skillCategories?: ResumeData['skillCategories'];
  education?: ResumeData['education'];
  certifications?: ResumeData['certifications'];
}

/**
 * Hook for parsing AI-generated resume content and updating the preview in real-time.
 * 
 * The parser extracts:
 * - Header (name, title, contact info)
 * - Summary with 2 options
 * - Experience with 2 project options per role (7 bullets each)
 * - Education entries
 * - Certifications
 * - Skill categories
 * - Projects
 */
export function useResumeParser(
  resumeData: ResumeData,
  onUpdate: (updates: Partial<ResumeData>) => void
) {
  const lastParsedLength = useRef(0);
  
  /**
   * Parse incrementally during streaming for live updates
   */
  const parseIncremental = useCallback((content: string) => {
    // Only parse if we have new content
    if (content.length <= lastParsedLength.current + 50) return;
    lastParsedLength.current = content.length;
    
    const updates: Partial<ResumeData> = {};
    
    // Parse header/personal info
    const nameMatch = content.match(/^# ([^\n]+)/m);
    if (nameMatch && nameMatch[1] !== resumeData.personalInfo.fullName) {
      updates.personalInfo = {
        ...resumeData.personalInfo,
        fullName: nameMatch[1].trim(),
      };
    }
    
    const titleMatch = content.match(/^\*\*([^*]+)\*\*$/m);
    if (titleMatch) {
      updates.personalInfo = {
        ...updates.personalInfo,
        ...resumeData.personalInfo,
        title: titleMatch[1].trim(),
      };
    }
    
    // Parse summary - look for both SUMMARY and Professional Summary headers
    const summarySection = content.match(/## (?:SUMMARY|Professional Summary)([\s\S]*?)(?=\n## |$)/i);
    if (summarySection) {
      const summaryText = summarySection[1];
      
      // Check for Option 1 and Option 2
      const option1Match = summaryText.match(/\*\*Option 1[:\s]*\*\*\s*([\s\S]*?)(?=\*\*Option 2|$)/i);
      const option2Match = summaryText.match(/\*\*Option 2[:\s]*\*\*\s*([\s\S]*?)(?=\n## |\n\n##|$)/i);
      
      if (option1Match) {
        const summary1 = option1Match[1].trim().replace(/\n+$/, '');
        const summary2 = option2Match ? option2Match[1].trim().replace(/\n+$/, '') : '';
        
        const summaryOptions: SummaryOption[] = [
          { id: 'summary-opt-1', content: summary1, isSelected: true },
        ];
        
        if (summary2) {
          summaryOptions.push({ id: 'summary-opt-2', content: summary2, isSelected: false });
        }
        
        updates.summaryOptions = summaryOptions;
        updates.summary = summary1;
      } else {
        // No options format - just take the summary text
        const cleanSummary = summaryText.trim().replace(/^\n+/, '').replace(/\n+$/, '');
        if (cleanSummary && cleanSummary.length > 20) {
          updates.summary = cleanSummary;
        }
      }
    }
    
    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
  }, [resumeData, onUpdate]);
  
  /**
   * Full parse after streaming complete - extracts all structured data
   */
  const parseComplete = useCallback((content: string) => {
    lastParsedLength.current = 0;
    
    const updates: Partial<ResumeData> = {};
    
    // ===== HEADER PARSING =====
    const nameMatch = content.match(/^# ([^\n]+)/m);
    const titleMatch = content.match(/^\*\*([^*\n]+)\*\*\s*$/m);
    const contactLine = content.match(/📍\s*([^|]+)\s*\|\s*✉️\s*([^|]+)\s*\|\s*📞\s*([^|]+)/);
    
    if (nameMatch || titleMatch || contactLine) {
      updates.personalInfo = { ...resumeData.personalInfo };
      
      if (nameMatch) updates.personalInfo.fullName = nameMatch[1].trim();
      if (titleMatch) updates.personalInfo.title = titleMatch[1].trim();
      if (contactLine) {
        updates.personalInfo.location = contactLine[1].trim();
        updates.personalInfo.email = contactLine[2].trim();
        updates.personalInfo.phone = contactLine[3].trim();
      }
    }
    
    // ===== SUMMARY PARSING =====
    const summarySection = content.match(/## (?:SUMMARY|Professional Summary)([\s\S]*?)(?=\n## EXPERIENCE|\n## Experience|$)/i);
    if (summarySection) {
      const summaryText = summarySection[1];
      const option1Match = summaryText.match(/\*\*Option 1[:\s]*\*\*\s*([\s\S]*?)(?=\*\*Option 2|$)/i);
      const option2Match = summaryText.match(/\*\*Option 2[:\s]*\*\*\s*([\s\S]*?)(?=\n## |\n\n|$)/i);
      
      if (option1Match) {
        const summary1 = option1Match[1].trim().replace(/\n+$/, '');
        const summary2 = option2Match ? option2Match[1].trim().replace(/\n+$/, '') : '';
        
        updates.summaryOptions = [
          { id: crypto.randomUUID(), content: summary1, isSelected: true },
        ];
        
        if (summary2) {
          updates.summaryOptions.push({ id: crypto.randomUUID(), content: summary2, isSelected: false });
        }
        
        updates.summary = summary1;
      }
    }
    
    // ===== EXPERIENCE PARSING =====
    const experienceSection = content.match(/## (?:EXPERIENCE|Experience)([\s\S]*?)(?=\n## (?:EDUCATION|Education)|$)/i);
    if (experienceSection) {
      const expText = experienceSection[1];
      // Split by role headers (### or **Role**)
      const roleBlocks = expText.split(/(?=###|\n\*\*[A-Z])/);
      
      const updatedClients = [...resumeData.clients];
      
      roleBlocks.forEach(block => {
        if (!block.trim()) return;
        
        // Parse role header: "### Role Title" or "**Role Title** \hfill Date"
        const roleMatch = block.match(/(?:###\s*)?(?:\*\*)?([^*\n]+?)(?:\*\*)?\s*(?:\\hfill|--|—)?\s*([A-Za-z]+\s+\d{4})?\s*(?:--|—)?\s*([A-Za-z]+\s+\d{4}|Present)?/);
        const companyMatch = block.match(/(?:\\textit\{|_|\*)?([^*_\n{}]+)(?:\}|_|\*)?\s*(?:\\hfill)?\s*([A-Za-z\s,]+)?$/m);
        
        if (!roleMatch) return;
        
        const role = roleMatch[1].replace(/\*\*/g, '').trim();
        const company = companyMatch ? companyMatch[1].trim() : '';
        
        // Find matching client
        const clientIndex = updatedClients.findIndex(
          c => c.role.toLowerCase().includes(role.toLowerCase()) || 
               c.name.toLowerCase().includes(company.toLowerCase())
        );
        
        if (clientIndex === -1) return;
        
        // Parse project options
        const option1Match = block.match(/\*\*(?:Project )?Option 1[:\s]*\*\*([\s\S]*?)(?=\*\*(?:Project )?Option 2|$)/i);
        const option2Match = block.match(/\*\*(?:Project )?Option 2[:\s]*\*\*([\s\S]*?)(?=\n###|\n## |$)/i);
        
        const extractBullets = (text: string): string[] => {
          return text
            .split('\n')
            .filter(line => line.trim().match(/^[-•\\item]\s*/))
            .map(line => line.replace(/^[-•]\s*|\\item\s*/g, '').trim())
            .filter(Boolean);
        };
        
        const projects: ProjectOption[] = [];
        
        if (option1Match) {
          projects.push({
            id: crypto.randomUUID(),
            title: 'Option 1',
            bullets: extractBullets(option1Match[1]),
            isSelected: true,
          });
        }
        
        if (option2Match) {
          projects.push({
            id: crypto.randomUUID(),
            title: 'Option 2',
            bullets: extractBullets(option2Match[1]),
            isSelected: false,
          });
        }
        
        // If no options, extract regular bullets
        if (projects.length === 0) {
          const allBullets = extractBullets(block);
          if (allBullets.length > 0) {
            projects.push({
              id: crypto.randomUUID(),
              title: 'Default',
              bullets: allBullets,
              isSelected: true,
            });
          }
        }
        
        if (projects.length > 0) {
          updatedClients[clientIndex] = {
            ...updatedClients[clientIndex],
            projects,
          };
        }
      });
      
      updates.clients = updatedClients;
    }
    
    // ===== SKILLS PARSING =====
    const skillsSection = content.match(/## (?:SKILLS|Skills)([\s\S]*?)(?=\n## (?:PROJECTS|Projects)|$)/i);
    if (skillsSection) {
      const skillLines = skillsSection[1].split('\n').filter(Boolean);
      const skillCategories: ResumeData['skillCategories'] = [];
      
      skillLines.forEach(line => {
        // Match "**Category:** skill1, skill2, skill3"
        const match = line.match(/\*\*([^*:]+):\*\*\s*(.+)/);
        if (match) {
          const category = match[1].trim();
          const skills = match[2].split(',').map(s => s.trim()).filter(Boolean);
          if (skills.length > 0) {
            skillCategories.push({ category, skills });
          }
        }
      });
      
      if (skillCategories.length > 0) {
        updates.skillCategories = skillCategories;
      }
    }
    
    // ===== EDUCATION PARSING =====
    const educationSection = content.match(/## (?:EDUCATION|Education)([\s\S]*?)(?=\n## (?:CERTIFICATIONS|Certifications|SKILLS|Skills)|$)/i);
    if (educationSection) {
      const eduLines = educationSection[1].trim().split(/\n(?=\\noindent|\*\*[A-Z])/);
      const education: ResumeData['education'] = [];
      
      eduLines.forEach(line => {
        if (!line.trim()) return;
        
        // Match "**Degree** in Field, School (GPA: X) | Date"
        const match = line.match(/\*\*([^*]+)\*\*(?:\s+in\s+([^,]+))?,?\s*([^(]+)?(?:\(GPA:\s*([^)]+)\))?\s*(?:\||\\hfill)\s*(.+)?/i);
        if (match) {
          education.push({
            id: crypto.randomUUID(),
            degree: match[1]?.trim() || '',
            field: match[2]?.trim() || '',
            school: match[3]?.trim() || '',
            gpa: match[4]?.trim() || '',
            graduationDate: match[5]?.trim() || '',
          });
        }
      });
      
      if (education.length > 0) {
        updates.education = education;
      }
    }
    
    // ===== CERTIFICATIONS PARSING =====
    const certsSection = content.match(/## (?:CERTIFICATIONS|Certifications)([\s\S]*?)(?=\n## (?:SKILLS|Skills|PROJECTS|Projects)|$)/i);
    if (certsSection) {
      const certLines = certsSection[1].split('\n').filter(Boolean);
      const certifications: ResumeData['certifications'] = [];
      
      certLines.forEach(line => {
        // Match "- **Cert Name**, Issuer | Date" or table format
        const match = line.match(/(?:-\s*)?\*\*([^*]+)\*\*,?\s*([^|&]+)?(?:\||&)?\s*(.+)?/);
        if (match) {
          certifications.push({
            id: crypto.randomUUID(),
            name: match[1]?.trim() || '',
            issuer: match[2]?.trim() || '',
            date: match[3]?.trim() || '',
          });
        }
      });
      
      if (certifications.length > 0) {
        updates.certifications = certifications;
      }
    }
    
    // Apply all updates
    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
    
    return updates;
  }, [resumeData, onUpdate]);
  
  /**
   * Reset parser state for new generation
   */
  const reset = useCallback(() => {
    lastParsedLength.current = 0;
  }, []);
  
  return {
    parseIncremental,
    parseComplete,
    reset,
  };
}
