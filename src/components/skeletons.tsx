/**
 * Loading shapes for each screen, shown only while a page loads for the first time
 * (repeat visits come from the client cache, see next.config staleTimes). Each one
 * mirrors its page, so nothing jumps when the real content arrives.
 */

const Bar = ({ className = "" }: { className?: string }) => <div className={`lf-shimmer rounded-full ${className}`} />;
const Block = ({ className = "" }: { className?: string }) => <div className={`lf-shimmer ${className}`} />;

function Frame({ children, label, wide }: { children: React.ReactNode; label: string; wide?: boolean }) {
  return (
    <div className={`mx-auto flex w-full flex-col gap-6 ${wide ? "" : "max-w-[640px]"}`} aria-busy="true" aria-label={label} data-app-loading>
      {children}
    </div>
  );
}

function Rows({ n = 3, h = "h-14" }: { n?: number; h?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: n }, (_, i) => (
        <Block key={i} className={`${h} rounded-2xl`} />
      ))}
    </div>
  );
}

/** Today: date, greeting, ask bar, green Up next card, Do today list. */
export function TodaySkeleton() {
  return (
    <Frame label="Loading Today">
      <div>
        <Bar className="h-4 w-36" />
        <Block className="mt-3 h-10 w-64 max-w-full rounded-xl" />
        <Bar className="mt-3 h-4 w-44" />
      </div>
      <Block className="h-12 rounded-full" />
      <Block className="h-28 rounded-[28px]" />
      <div className="flex flex-col gap-3">
        <Bar className="h-4 w-24" />
        <Rows n={3} />
      </div>
    </Frame>
  );
}

/** Plan: title, week strip, the day's blocks. */
export function PlanSkeleton() {
  return (
    <Frame label="Loading Plan" wide>
      <div className="flex items-center justify-between gap-3">
        <Block className="h-9 w-44 rounded-xl" />
        <Block className="h-10 w-28 rounded-full" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Block key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
      <Rows n={5} h="h-16" />
    </Frame>
  );
}

/** Money: available-now card, three numbers, the 30-day bar, recent activity. */
export function MoneySkeleton() {
  return (
    <Frame label="Loading Money" wide>
      <Block className="h-9 w-40 rounded-xl" />
      <Block className="h-32 rounded-[28px]" />
      <div className="grid grid-cols-3 gap-3">
        <Block className="h-20 rounded-2xl" />
        <Block className="h-20 rounded-2xl" />
        <Block className="h-20 rounded-2xl" />
      </div>
      <Block className="h-8 rounded-full" />
      <Rows n={4} />
    </Frame>
  );
}

/** School: title, class cards, what's due. */
export function SchoolSkeleton() {
  return (
    <Frame label="Loading School" wide>
      <Block className="h-9 w-40 rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Block className="h-28 rounded-3xl" />
        <Block className="h-28 rounded-3xl" />
        <Block className="h-28 rounded-3xl" />
        <Block className="h-28 rounded-3xl" />
      </div>
      <Rows n={3} />
    </Frame>
  );
}

/** Lists (to-dos, updates, settings and other pages): title, an input or filter row, rows. */
export function ListSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Frame label={label}>
      <Block className="h-9 w-48 rounded-xl" />
      <Block className="h-12 rounded-full" />
      <Rows n={6} />
    </Frame>
  );
}

/** The skyling's chat: a few message bubbles above the composer. */
/**
 * The skyling's page (owner, 2026-11-18: "the skeleton doesn't even match how the page looks"): its name and New chat on
 * top, the four pills, the skyling's window, a row of clouds under it, and the message bar at the bottom. A laptop also
 * has the list of earlier chats on the left.
 */
export function ChatSkeleton() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-6xl gap-8" aria-busy="true" aria-label="Loading chat" data-app-loading>
      <div className="hidden w-72 shrink-0 flex-col gap-5 pt-2 lg:flex">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Bar className="h-4 w-56" />
            <Bar className="h-3 w-14" />
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex items-center justify-between">
          <Bar className="h-6 w-16" />
          <Bar className="h-9 w-28" />
        </div>
        <div className="flex gap-2">
          <Block className="h-11 w-24 rounded-full" />
          <Block className="h-11 w-28 rounded-full" />
          <Block className="h-11 w-24 rounded-full max-sm:hidden" />
          <Block className="h-11 w-28 rounded-full max-sm:hidden" />
        </div>
        <Block className="h-60 rounded-[2rem] sm:h-72" />
        <div className="flex gap-3">
          <Block className="h-24 flex-1 rounded-2xl" />
          <Block className="h-24 flex-1 rounded-2xl max-sm:hidden" />
          <Block className="h-24 flex-1 rounded-2xl max-md:hidden" />
        </div>
        <Block className="mt-auto h-16 rounded-full" />
      </div>
    </div>
  );
}
