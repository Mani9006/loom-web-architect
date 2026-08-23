import { Link } from "react-router-dom";
import { Wordmark } from "@/product/components/Mark";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
      <Wordmark />
      <p className="mt-8 font-mono text-[13px] text-primary">404</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Not Found</h1>
      <p className="mt-2 max-w-sm text-center text-[13px] text-muted-foreground">This route is not part of the ResumePreps desk. Same graphite system as Home — not a leftover marketing splash.</p>
      <div className="mt-6 flex gap-3">
        <Link to="/" className="h-9 rounded-md border border-border px-3 text-[13px] leading-9 no-underline">Marketing</Link>
        <Link to="/home" className="h-9 rounded-md bg-primary px-3 text-[13px] leading-9 text-primary-foreground no-underline">Home</Link>
      </div>
    </div>
  );
}
