import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface AIMessageContentProps {
  content: string;
  className?: string;
}

/**
 * Professional AI message renderer with enhanced markdown styling
 * Styled to match modern AI assistants like ChatGPT, Claude, and Gemini
 */
export function AIMessageContent({ content, className }: AIMessageContentProps) {
  return (
    <div className={cn("ai-message-content", className)}>
      <ReactMarkdown
        components={{
          // Headings with proper hierarchy and spacing
          h1: ({ children }) => (
            <h1 className="text-xl font-semibold text-foreground mt-6 mb-3 first:mt-0 pb-2 border-b border-border">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-foreground mt-5 mb-2 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground mt-4 mb-2 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-foreground mt-3 mb-1 first:mt-0">
              {children}
            </h4>
          ),
          
          // Paragraphs with proper line height and spacing
          p: ({ children }) => (
            <p className="text-sm leading-relaxed text-foreground/90 mb-3 last:mb-0">
              {children}
            </p>
          ),
          
          // Lists with clean styling
          ul: ({ children }) => (
            <ul className="my-3 ml-1 space-y-2">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 ml-1 space-y-2 list-decimal list-inside">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed text-foreground/90 flex items-start gap-2">
              <span className="text-primary mt-1.5 shrink-0">•</span>
              <span className="flex-1">{children}</span>
            </li>
          ),
          
          // Strong/bold text
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          
          // Emphasis/italic
          em: ({ children }) => (
            <em className="italic text-foreground/80">
              {children}
            </em>
          ),
          
          // Code blocks
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-muted text-primary text-xs font-mono">
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("block p-3 rounded-lg bg-muted/50 text-sm font-mono overflow-x-auto my-3", className)} {...props}>
                {children}
              </code>
            );
          },
          
          // Pre blocks for code
          pre: ({ children }) => (
            <pre className="my-3 rounded-lg bg-muted/50 overflow-hidden">
              {children}
            </pre>
          ),
          
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="my-3 pl-4 border-l-2 border-primary/50 text-foreground/80 italic">
              {children}
            </blockquote>
          ),
          
          // Horizontal rules
          hr: () => (
            <hr className="my-4 border-border" />
          ),
          
          // Links
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          ),
          
          // Tables
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold border-b border-border">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border/50">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
