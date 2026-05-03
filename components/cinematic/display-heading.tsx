import { cn } from "@/lib/utils";

export function DisplayHeading({
  children,
  className,
  as: Tag = "h1",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag
      className={cn(
        "font-heading tracking-tight text-balance text-[var(--bn-fg)] drop-shadow-[0_2px_48px_rgba(0,0,0,0.65)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
