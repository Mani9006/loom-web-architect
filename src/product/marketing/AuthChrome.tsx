import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Mark } from "@/product/components/Mark";
import { SkipLink } from "@/product/ui/SkipLink";
import { DeskPreview } from "./DeskPreview";

export function AuthChrome({
  kicker,
  title,
  body,
  children,
  formId = "auth-form",
}: {
  kicker: string;
  title: string;
  body: string;
  children: ReactNode;
  formId?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SkipLink href={`#${formId}`} />
      <header className="border-b border-border">
        <div className="flex h-12 items-center justify-between px-5">
          <Mark href="/" />
          <button type="button" onClick={toggleTheme} className="rp-btn rp-btn-ghost" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <section className="hidden min-h-0 flex-col gap-6 overflow-auto border-r border-border bg-[hsl(var(--rp-well))] p-7 lg:flex xl:p-9">
          <div className="max-w-xl">
            <p className="rp-kicker">{kicker}</p>
            <h1 className="mt-2 font-display text-display-md">{title}</h1>
            <p className="mt-3 max-w-lg text-[15px] leading-7 text-muted-foreground">{body}</p>
          </div>
          <DeskPreview />
          <DeskPreview variant="receipt" />
        </section>
        <section className="flex flex-col justify-start bg-background px-5 py-10 sm:px-10 lg:py-12">
          <div className="w-full max-w-md">
            <div className="mb-6 lg:hidden">
              <p className="rp-kicker">{kicker}</p>
              <h1 className="mt-2 text-[22px] font-semibold tracking-tight">{title}</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
            {children}
            <div className="rp-well mt-4 p-4">
              <p className="text-[12px] font-medium">Submitted waits for a worker receipt.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Queued and Filling are not billed. Greenhouse, Lever, Ashby, and Workable can submit. Workday stays Needs you.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
