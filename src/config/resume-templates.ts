/**
 * Resume Template Configuration
 * 
 * This file defines the JSON structure for resume templates based on LaTeX formats.
 * The structure maps directly to the ResumeData interface for live preview rendering.
 */

export interface TemplateSection {
  id: string;
  name: string;
  type: 'header' | 'summary' | 'experience' | 'education' | 'certifications' | 'skills' | 'projects';
  required: boolean;
  order: number;
}

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  preview: string;
  
  // Layout settings (matching LaTeX template)
  layout: {
    marginTop: string;      // 1.8cm
    marginBottom: string;   // 2cm
    marginLeft: string;     // 2cm
    marginRight: string;    // 2cm
    fontFamily: string;     // Charter, Georgia, serif
    fontSize: string;       // 10pt
    lineHeight: number;     // 1.4
    headerFontSize: string; // 19pt
    titleFontSize: string;  // 11.5pt
    sectionGap: string;     // spacing between sections
  };
  
  // Section order and configuration
  sections: TemplateSection[];
  
  // Experience bullet configuration
  experience: {
    bulletsPerRole: number;     // 7 bullets per experience entry
    optionsCount: number;       // 2 project options per role
    dateFormat: string;         // "MMM yyyy -- Present" format
    showLocation: boolean;
    showIndustry: boolean;
  };
  
  // Summary configuration
  summary: {
    optionsCount: number;       // 2 summary options
    maxSentences: number;       // 2-3 sentences
    includeYearsExperience: boolean;
  };
  
  // Skills configuration
  skills: {
    categorized: boolean;       // Group by category
    maxCategories: number;
    maxSkillsPerCategory: number;
  };
}

// Professional template based on the provided LaTeX code
export const PROFESSIONAL_TEMPLATE: TemplateConfig = {
  id: 'professional',
  name: 'Professional',
  description: 'ATS-optimized template with clean formatting, ideal for technical and corporate roles',
  preview: '/src/assets/templates/template-professional.jpg',
  
  layout: {
    marginTop: '1.8cm',
    marginBottom: '2cm',
    marginLeft: '2cm',
    marginRight: '2cm',
    fontFamily: "'Charter', 'Georgia', serif",
    fontSize: '10pt',
    lineHeight: 1.4,
    headerFontSize: '19pt',
    titleFontSize: '11.5pt',
    sectionGap: '0.5cm',
  },
  
  sections: [
    { id: 'header', name: 'Header', type: 'header', required: true, order: 1 },
    { id: 'summary', name: 'Summary', type: 'summary', required: true, order: 2 },
    { id: 'experience', name: 'Experience', type: 'experience', required: true, order: 3 },
    { id: 'education', name: 'Education', type: 'education', required: true, order: 4 },
    { id: 'certifications', name: 'Certifications', type: 'certifications', required: false, order: 5 },
    { id: 'skills', name: 'Skills', type: 'skills', required: true, order: 6 },
    { id: 'projects', name: 'Projects', type: 'projects', required: false, order: 7 },
  ],
  
  experience: {
    bulletsPerRole: 7,
    optionsCount: 2,
    dateFormat: 'MMM yyyy',
    showLocation: true,
    showIndustry: false,
  },
  
  summary: {
    optionsCount: 2,
    maxSentences: 3,
    includeYearsExperience: true,
  },
  
  skills: {
    categorized: true,
    maxCategories: 8,
    maxSkillsPerCategory: 15,
  },
};

// Creative template (alternative styling)
export const CREATIVE_TEMPLATE: TemplateConfig = {
  id: 'creative',
  name: 'Creative',
  description: 'Modern template with visual flair, suitable for design and creative roles',
  preview: '/src/assets/templates/template-creative.jpg',
  
  layout: {
    marginTop: '1.5cm',
    marginBottom: '1.5cm',
    marginLeft: '1.8cm',
    marginRight: '1.8cm',
    fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
    fontSize: '10pt',
    lineHeight: 1.5,
    headerFontSize: '22pt',
    titleFontSize: '12pt',
    sectionGap: '0.6cm',
  },
  
  sections: [
    { id: 'header', name: 'Header', type: 'header', required: true, order: 1 },
    { id: 'summary', name: 'Profile', type: 'summary', required: true, order: 2 },
    { id: 'skills', name: 'Skills', type: 'skills', required: true, order: 3 },
    { id: 'experience', name: 'Experience', type: 'experience', required: true, order: 4 },
    { id: 'projects', name: 'Projects', type: 'projects', required: false, order: 5 },
    { id: 'education', name: 'Education', type: 'education', required: true, order: 6 },
    { id: 'certifications', name: 'Certifications', type: 'certifications', required: false, order: 7 },
  ],
  
  experience: {
    bulletsPerRole: 5,
    optionsCount: 2,
    dateFormat: 'MMM yyyy',
    showLocation: true,
    showIndustry: true,
  },
  
  summary: {
    optionsCount: 2,
    maxSentences: 2,
    includeYearsExperience: false,
  },
  
  skills: {
    categorized: true,
    maxCategories: 6,
    maxSkillsPerCategory: 10,
  },
};

// Template registry
export const TEMPLATES: Record<string, TemplateConfig> = {
  professional: PROFESSIONAL_TEMPLATE,
  creative: CREATIVE_TEMPLATE,
};

export const getTemplate = (templateId: string): TemplateConfig => {
  return TEMPLATES[templateId] || PROFESSIONAL_TEMPLATE;
};

/**
 * LaTeX Structure Mapping
 * 
 * The provided LaTeX template uses these environments and commands:
 * 
 * HEADER:
 * - \begin{header} ... \end{header}
 * - \fontsize{19pt} for name
 * - \fontsize{11.5pt} for title
 * - \faMapMarker*, \faEnvelope, \faPhone, \faLinkedin icons
 * - \AND separator (|)
 * 
 * SECTIONS:
 * - \section*{SECTION_NAME} with \titlerule underline
 * 
 * EXPERIENCE:
 * - Role + Date on same line: \textbf{Role} \hfill Date
 * - Company italicized: \textit{Company} \hfill Location
 * - Bullets in itemize with leftmargin=15pt
 * 
 * EDUCATION:
 * - \textbf{Degree}, School (GPA: X) \hfill Date
 * - Location on right side
 * 
 * CERTIFICATIONS:
 * - tabularx format: Cert Name, Issuer | Date
 * - Blue text for clickable certs
 * 
 * SKILLS:
 * - \textbf{Category:} skill1, skill2, skill3...
 * 
 * PROJECTS:
 * - \textbf{Project Name} \hfill \textit{Org — Date}
 * - Bullets for description
 */
