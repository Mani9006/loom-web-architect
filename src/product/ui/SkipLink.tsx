export function SkipLink({ href = "#main" }: { href?: string }) {
  return (
    <a href={href} className="skip-link">
      Skip to content
    </a>
  );
}
