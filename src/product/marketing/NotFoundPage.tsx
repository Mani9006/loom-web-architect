import { Link } from "react-router-dom";
import { Mark } from "@/product/components/Mark";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
      <Mark href="/" />
      <p className="mt-12 font-mono text-xs uppercase tracking-[0.2em] text-primary">404</p>
      <h1 className="mt-4 font-display text-5xl">Not found</h1>
      <p className="mt-4 max-w-sm text-center text-body text-muted-foreground">
        This route is not part of ResumePreps. Same night canvas as Home — not a leftover splash.
      </p>
      <div className="mt-8 flex gap-4">
        <Link to="/" className="border border-border px-4 py-2 text-caption no-underline">
          Marketing
        </Link>
        <Link to="/home" className="bg-primary px-4 py-2 text-caption text-primary-foreground no-underline">
          Home
        </Link>
      </div>
    </div>
  );
}
