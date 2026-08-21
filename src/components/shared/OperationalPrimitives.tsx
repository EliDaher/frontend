import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type AppButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type AppButtonSize = "sm" | "md" | "lg";

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
};

const buttonVariants: Record<AppButtonVariant, string> = {
  primary: "border-app-primary bg-app-primary text-app-primary-foreground hover:border-app-primary-hover hover:bg-app-primary-hover",
  secondary: "border-app-border bg-app-surface text-app-ink hover:border-app-border-strong hover:bg-app-surface-muted",
  outline: "border-app-border bg-transparent text-app-ink hover:border-app-primary hover:bg-app-primary-soft hover:text-app-primary",
  ghost: "border-transparent bg-transparent text-app-ink hover:bg-app-surface-muted",
  destructive: "border-app-danger bg-app-danger text-white hover:border-red-800 hover:bg-red-800"
};

const buttonSizes: Record<AppButtonSize, string> = {
  sm: "h-10 gap-1.5 px-3 text-xs sm:h-9",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-sm"
};

export function AppButton({
  children,
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  iconStart,
  iconEnd,
  type = "button",
  ...props
}: AppButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-app-md border font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:border-app-border disabled:bg-app-surface-muted disabled:text-app-muted",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : iconStart}
      <span className="min-w-0 truncate">{children}</span>
      {iconEnd}
    </button>
  );
}

type AppSurfaceVariant = "default" | "muted" | "borderless";

type AppSurfaceProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  action?: ReactNode;
  variant?: AppSurfaceVariant;
  as?: "section" | "div" | "article";
};

const surfaceVariants: Record<AppSurfaceVariant, string> = {
  default: "border-app-border bg-app-surface",
  muted: "border-app-border bg-app-surface-muted",
  borderless: "border-transparent bg-app-surface"
};

export function AppSurface({
  title,
  action,
  children,
  className,
  variant = "default",
  as: Component = "section",
  ...props
}: AppSurfaceProps) {
  return (
    <Component className={cn("rounded-app-lg border", surfaceVariants[variant], className)} {...props}>
      {title || action ? (
        <div className="flex items-center justify-between gap-3 border-b border-app-border px-4 py-3">
          {title ? <h2 className="text-app-panel-title font-semibold text-app-ink">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <div className={title || action ? "p-4" : undefined}>{children}</div>
    </Component>
  );
}

type AppBadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger";

type AppBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: AppBadgeVariant;
};

const badgeVariants: Record<AppBadgeVariant, string> = {
  neutral: "border-app-border bg-app-surface-muted text-app-muted",
  primary: "border-transparent bg-app-primary-soft text-app-primary",
  success: "border-transparent bg-app-success-soft text-app-success",
  warning: "border-transparent bg-app-warning-soft text-app-warning",
  danger: "border-transparent bg-app-danger-soft text-app-danger"
};

export function AppBadge({ children, className, variant = "neutral", ...props }: AppBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center rounded-app-sm border px-2 text-xs font-semibold leading-none",
        badgeVariants[variant],
        className
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

type AppFieldShellProps = {
  label?: ReactNode;
  helperText?: ReactNode;
  errorText?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AppFieldShell({ label, helperText, errorText, children, className }: AppFieldShellProps) {
  return (
    <label className={cn("grid gap-1.5 text-app-label text-app-ink", className)}>
      {label ? <span>{label}</span> : null}
      {children}
      {errorText ? <span className="text-app-helper font-medium text-app-danger">{errorText}</span> : null}
      {!errorText && helperText ? <span className="text-app-helper font-medium text-app-muted">{helperText}</span> : null}
    </label>
  );
}

const controlClasses =
  "w-full rounded-app-md border border-app-border bg-app-surface px-3 text-app-body font-medium text-app-ink outline-none transition-colors placeholder:text-app-muted focus:border-app-primary focus:ring-4 focus:ring-app-primary-soft disabled:cursor-not-allowed disabled:bg-app-surface-muted disabled:text-app-muted";

type AppInputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

export function AppInput({ className, error, ...props }: AppInputProps) {
  return <input className={cn("h-10", controlClasses, error && "border-app-danger focus:border-app-danger focus:ring-app-danger-soft", className)} {...props} />;
}

type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

export function AppTextarea({ className, error, ...props }: AppTextareaProps) {
  return (
    <textarea
      className={cn("min-h-24 py-2", controlClasses, error && "border-app-danger focus:border-app-danger focus:ring-app-danger-soft", className)}
      {...props}
    />
  );
}

type AppSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean;
};

export function AppSelect({ className, error, children, ...props }: AppSelectProps) {
  return (
    <select className={cn("h-10", controlClasses, error && "border-app-danger focus:border-app-danger focus:ring-app-danger-soft", className)} {...props}>
      {children}
    </select>
  );
}

type AppPageHeaderProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
};

export function AppPageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  className,
  ...props
}: AppPageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)} {...props}>
      <div className="min-w-0">
        <h1 className="text-app-page-title font-semibold text-app-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-app-body text-app-muted">{description}</p> : null}
      </div>
      {primaryAction || secondaryActions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      ) : null}
    </header>
  );
}

type AppToolbarProps = HTMLAttributes<HTMLDivElement> & {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
};

export function AppToolbar({ search, filters, actions, children, className, ...props }: AppToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-app-lg border border-app-border bg-app-surface p-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {search ? <div className="min-w-0 flex-1">{search}</div> : null}
        {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type AppEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function AppEmptyState({ icon, title, description, action, className, ...props }: AppEmptyStateProps) {
  return (
    <div
      className={cn(
        "grid justify-items-center rounded-app-lg border border-dashed border-app-border-strong bg-app-surface px-5 py-8 text-center",
        className
      )}
      {...props}
    >
      {icon ? <div className="mb-3 text-app-muted">{icon}</div> : null}
      <p className="text-app-panel-title font-semibold text-app-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-app-helper text-app-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
