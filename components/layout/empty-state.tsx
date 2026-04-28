import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon, title, description, className, action }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/30 px-6 py-14 text-center",
        className
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-card shadow-md ring-1 ring-border/60">
        {icon}
      </div>
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
