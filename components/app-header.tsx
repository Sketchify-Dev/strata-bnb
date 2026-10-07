import Link from "next/link";
import { Wordmark } from "@/components/logo";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/app"
              className="text-sm text-ink transition-colors hover:text-ink"
            >
              Baskets
            </Link>
            <Link
              href="/app/portfolio"
              className="text-sm text-ink-secondary transition-colors hover:text-ink"
            >
              Portfolio
            </Link>
            <Link
              href="/app/agent"
              className="text-sm text-ink-secondary transition-colors hover:text-ink"
            >
              Agent
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-ink-muted sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Demo
          </span>
          <button
            type="button"
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            Connect wallet
          </button>
        </div>
      </div>
    </header>
  );
}
