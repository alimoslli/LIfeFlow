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

/** The assistant's chat: a few message bubbles above the composer. */
export function ChatSkeleton() {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col justify-end gap-4 px-4 pb-28" aria-busy="true" aria-label="Loading chat" data-app-loading>
      <Block className="h-12 w-2/3 self-end rounded-3xl" />
      <Block className="h-24 w-4/5 rounded-3xl" />
      <Block className="h-10 w-1/2 self-end rounded-3xl" />
      <Block className="h-14 rounded-[28px]" />
    </div>
  );
}
