import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Mail, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CoverLetterActionsProps {
  content: string;
  title: string;
  companyName?: string;
  jobTitle?: string;
}

export function useCoverLetterActions() {
  const [isExporting, setIsExporting] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const { toast } = useToast();

  const exportToPdf = async (content: string, title: string) => {
    setIsExporting(true);

    try {
      // Lazy load html2pdf only when user triggers export
      const html2pdf = (await import("html2pdf.js")).default;

      // Create a styled HTML container for the PDF using safe DOM manipulation
      // to prevent XSS attacks from user-controlled content
      const container = document.createElement("div");

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "font-family: 'Georgia', serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6;";

      const heading = document.createElement("h1");
      heading.style.cssText = "font-size: 18px; margin-bottom: 24px; color: #1a1a1a;";
      heading.textContent = title; // Safe - uses textContent, no HTML parsing

      const contentDiv = document.createElement("div");
      contentDiv.style.cssText = "font-size: 12px; color: #333; white-space: pre-wrap;";
      contentDiv.textContent = content; // Safe - uses textContent, no HTML parsing

      wrapper.appendChild(heading);
      wrapper.appendChild(contentDiv);
      container.appendChild(wrapper);

      const options = {
        margin: [15, 15, 15, 15] as [number, number, number, number],
        filename: `${title.replace(/[^a-z0-9]/gi, "_")}.pdf`,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
      };

      await html2pdf().set(options).from(container).save();

      toast({
        title: "PDF Downloaded",
        description: "Your cover letter has been saved as a PDF.",
      });
    } catch (error) {
      console.error("PDF export error:", error);
      toast({
        title: "Export Failed",
        description: "Failed to export cover letter as PDF.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const openEmailClient = (recipientEmail: string, subject: string, content: string) => {
    const body = encodeURIComponent(content);
    const mailtoLink = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${body}`;
    window.open(mailtoLink, "_blank");
    
    toast({
      title: "Email Client Opened",
      description: "Your email client should open with the cover letter content.",
    });
  };

  return {
    isExporting,
    emailDialogOpen,
    setEmailDialogOpen,
    exportToPdf,
    openEmailClient,
  };
}

interface EmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  companyName?: string;
  jobTitle?: string;
  onSend: (email: string, subject: string, content: string) => void;
}

export function EmailDialog({
  open,
  onOpenChange,
  content,
  companyName,
  jobTitle,
  onSend,
}: EmailDialogProps) {
  const [email, setEmail] = useState("");
  const defaultSubject = jobTitle && companyName 
    ? `Application for ${jobTitle} at ${companyName}` 
    : jobTitle 
      ? `Application for ${jobTitle}` 
      : "Job Application";
  const [subject, setSubject] = useState(defaultSubject);

  const handleSend = () => {
    if (!email.trim()) return;
    onSend(email.trim(), subject, content);
    onOpenChange(false);
    setEmail("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Cover Letter</DialogTitle>
          <DialogDescription>
            This will open your default email client with the cover letter content.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipient-email">Recipient Email</Label>
            <Input
              id="recipient-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hiring.manager@company.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Application for..."
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!email.trim()}>
            <Mail className="h-4 w-4 mr-2" />
            Open Email Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ActionButtonsProps {
  content: string;
  title: string;
  companyName?: string;
  jobTitle?: string;
  disabled?: boolean;
}

export function CoverLetterActionButtons({
  content,
  title,
  companyName,
  jobTitle,
  disabled,
}: ActionButtonsProps) {
  const { isExporting, emailDialogOpen, setEmailDialogOpen, exportToPdf, openEmailClient } = useCoverLetterActions();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => exportToPdf(content, title)}
        disabled={disabled || isExporting}
        className="gap-1"
      >
        {isExporting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <FileDown className="h-3 w-3" />
        )}
        PDF
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEmailDialogOpen(true)}
        disabled={disabled}
        className="gap-1"
      >
        <Mail className="h-3 w-3" />
        Email
      </Button>
      
      <EmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        content={content}
        companyName={companyName}
        jobTitle={jobTitle}
        onSend={openEmailClient}
      />
    </>
  );
}
