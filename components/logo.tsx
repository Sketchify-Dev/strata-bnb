export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <rect x="4" y="5.5" width="20" height="4.2" rx="2.1" fill="var(--gold)" />
      <rect
        x="4"
        y="12.2"
        width="20"
        height="4.2"
        rx="2.1"
        fill="currentColor"
        opacity="0.55"
      />
      <rect
        x="4"
        y="18.9"
        width="20"
        height="4.2"
        rx="2.1"
        fill="currentColor"
        opacity="0.28"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <Logo className="h-6 w-6 text-ink" />
      <span className="text-[17px] font-semibold tracking-tight text-ink">
        Strata
      </span>
    </span>
  );
}
