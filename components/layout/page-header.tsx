import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  className?: string;
  children?: React.ReactNode;
};

export function PageHeader({ title, description, eyebrow, className, children }: PageHeaderProps) {
  return (
    <header className={cn("relative pb-6 pt-1", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/90">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[1.65rem] sm:leading-tight">
            {title}
          </h1>
          {description ? (
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children ? <div className="shrink-0">{children}</div> : null}
      </div>
    </header>
  );
}

export function PageContainer({
  children,
  className,
  narrow,
}: {
  children: React.ReactNode;
  className?: string;
  /** max-w-lg — forms & mobile-first lists */
  narrow?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-4 pb-28 pt-5 sm:px-6 sm:pb-32 sm:pt-6",
        narrow ? "max-w-lg" : "max-w-2xl",
        className
      )}
    >
      {children}
    </div>
  );
}
