import { useCallback, useRef } from 'react';
import { ResumeJSON } from '@/types/resume';

/**
 * Hook for parsing AI-generated resume content and updating the preview in real-time.
 * 
 * The parser extracts:
 * - Header (name, title, contact info)
 * - Summary
 * - Experience with bullets
 * - Education entries
 * - Certifications
 * - Skills (object with categories)
 * - Projects
 */
export function useResumeParser(
  resumeData: ResumeJSON,
  onUpdate: (updates: Partial<ResumeJSON>) => void
) {
  const lastParsedLength = useRef(0);
  
  /**
   * Parse incrementally during streaming for live updates
   */
  const parseIncremental = useCallback((content: string) => {
    // Only parse if we have new content
    if (content.length <= lastParsedLength.current + 50) return;
    lastParsedLength.current = content.length;
    
    const updates: Partial<ResumeJSON> = {};
    
    // Parse header/personal info
    const nameMatch = content.match(/^# ([^\n]+)/m);
    if (nameMatch && nameMatch[1] !== resumeData.header.name) {
      updates.header = {
        ...resumeData.header,
        name: nameMatch[1].trim(),
      };
    }
    
    const titleMatch = content.match(/^\*\*([^*]+)\*\*$/m);
    if (titleMatch) {
      updates.header = {
        ...updates.header,
        ...resumeData.header,
        title: titleMatch[1].trim(),
      };
    }
    
    // Parse summary
    const summarySection = content.match(/## (?:SUMMARY|Professional Summary)([\s\S]*?)(?=\n## |$)/i);
    if (summarySection) {
      const summaryText = summarySection[1].trim().replace(/^\n+/, '').replace(/\n+$/, '');
      if (summaryText && summaryText.length > 20) {
        updates.summary = summaryText;
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
    
    const updates: Partial<ResumeJSON> = {};
    
    // ===== HEADER PARSING =====
    const nameMatch = content.match(/^# ([^\n]+)/m);
    const titleMatch = content.match(/^\*\*([^*\n]+)\*\*\s*$/m);
    const contactLine = content.match(/📍\s*([^|]+)\s*\|\s*✉️\s*([^|]+)\s*\|\s*📞\s*([^|]+)/);
    
    if (nameMatch || titleMatch || contactLine) {
      updates.header = { ...resumeData.header };
      
      if (nameMatch) updates.header.name = nameMatch[1].trim();
      if (titleMatch) updates.header.title = titleMatch[1].trim();
      if (contactLine) {
        updates.header.location = contactLine[1].trim();
        updates.header.email = contactLine[2].trim();
        updates.header.phone = contactLine[3].trim();
      }
    }
    
    // ===== SUMMARY PARSING =====
    const summarySection = content.match(/## (?:SUMMARY|Professional Summary)([\s\S]*?)(?=\n## EXPERIENCE|\n## Experience|$)/i);
    if (summarySection) {
      const summaryText = summarySection[1].trim().replace(/^\n+/, '').replace(/\n+$/, '');
      if (summaryText && summaryText.length > 20) {
        updates.summary = summaryText;
      }
    }
    
    // ===== EXPERIENCE PARSING =====
    const experienceSection = content.match(/## (?:EXPERIENCE|Experience)([\s\S]*?)(?=\n## (?:EDUCATION|Education)|$)/i);
    if (experienceSection) {
      const expText = experienceSection[1];
      const roleBlocks = expText.split(/(?=###|\n\*\*[A-Z])/);
      
      const experience: ResumeJSON['experience'] = [];
      
      roleBlocks.forEach(block => {
        if (!block.trim()) return;
        
        const roleMatch = block.match(/(?:###\s*)?(?:\*\*)?([^*\n]+?)(?:\*\*)?\s*(?:\\hfill|--|—)?\s*([A-Za-z]+\s+\d{4})?\s*(?:--|—)?\s*([A-Za-z]+\s+\d{4}|Present)?/);
        const companyMatch = block.match(/(?:\\textit\{|_|\*)?([^*_\n{}]+)(?:\}|_|\*)?\s*(?:\\hfill)?\s*([A-Za-z\s,]+)?$/m);
        
        if (!roleMatch) return;
        
        const extractBullets = (text: string): string[] => {
          return text
            .split('\n')
            .filter(line => line.trim().match(/^[-•\\item]\s*/))
            .map(line => line.replace(/^[-•]\s*|\\item\s*/g, '').trim())
            .filter(Boolean);
        };
        
        const bullets = extractBullets(block);
        
        experience.push({
          id: crypto.randomUUID(),
          role: roleMatch[1].replace(/\*\*/g, '').trim(),
          company_or_client: companyMatch ? companyMatch[1].trim() : '',
          start_date: roleMatch[2] || '',
          end_date: roleMatch[3] || '',
          location: companyMatch?.[2]?.trim() || '',
          bullets,
        });
      });
      
      if (experience.length > 0) {
        updates.experience = experience;
      }
    }
    
    // ===== SKILLS PARSING =====
    const skillsSection = content.match(/## (?:SKILLS|Skills)([\s\S]*?)(?=\n## (?:PROJECTS|Projects)|$)/i);
    if (skillsSection) {
      const skillLines = skillsSection[1].split('\n').filter(Boolean);
      const skills: ResumeJSON['skills'] = {
        generative_ai: [],
        nlp: [],
        machine_learning: [],
        programming_languages: [],
        data_engineering_etl: [],
        visualization: [],
        cloud_mlops: [],
        collaboration_tools: [],
      };
      
      skillLines.forEach(line => {
        const match = line.match(/\*\*([^*:]+):\*\*\s*(.+)/);
        if (match) {
          const category = match[1].trim().toLowerCase().replace(/\s+/g, '_').replace(/&/g, '');
          const skillList = match[2].split(',').map(s => s.trim()).filter(Boolean);
          if (skillList.length > 0) {
            skills[category] = skillList;
          }
        }
      });
      
      updates.skills = skills;
    }
    
    // ===== EDUCATION PARSING =====
    const educationSection = content.match(/## (?:EDUCATION|Education)([\s\S]*?)(?=\n## (?:CERTIFICATIONS|Certifications|SKILLS|Skills)|$)/i);
    if (educationSection) {
      const eduLines = educationSection[1].trim().split(/\n(?=\\noindent|\*\*[A-Z])/);
      const education: ResumeJSON['education'] = [];
      
      eduLines.forEach(line => {
        if (!line.trim()) return;
        
        const match = line.match(/\*\*([^*]+)\*\*(?:\s+in\s+([^,]+))?,?\s*([^(]+)?(?:\(GPA:\s*([^)]+)\))?\s*(?:\||\\hfill)\s*(.+)?/i);
        if (match) {
          education.push({
            id: crypto.randomUUID(),
            degree: match[1]?.trim() || '',
            field: match[2]?.trim() || '',
            institution: match[3]?.trim() || '',
            gpa: match[4]?.trim() || '',
            graduation_date: match[5]?.trim() || '',
            location: '',
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
      const certifications: ResumeJSON['certifications'] = [];
      
      certLines.forEach(line => {
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
