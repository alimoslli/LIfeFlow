/**
 * Loading shapes for each screen, shown only while a page loads for the first time
 * (repeat visits come from the client cache, see next.config staleTimes). Each one
 * mirrors its page, block for block, on a phone and on a laptop, so nothing jumps when the real content arrives
 * (owner, 2026-11-18: "the skeleton doesn't even match how the page looks"). When a page's layout changes, change its shape here too.
 */

const Bar = ({ className = "" }: { className?: string }) => <div className={`lf-shimmer rounded-full ${className}`} />;
const Block = ({ className = "" }: { className?: string }) => <div className={`lf-shimmer ${className}`} />;

/** The root of every shape: what the splash and screen readers look for. `className` is the page's own width and gap. */
function Frame({ children, label, className = "" }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={className} aria-busy="true" aria-label={label} data-app-loading>
      {children}
    </div>
  );
}

/** The date line, big title and an optional round-ended button on the right (Money, Goals, Health, Work, Calendar). */
function Head({ date = true, button, title = "w-40" }: { date?: boolean; button?: string; title?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        {date && <Bar className="h-5 w-44" />}
        <Block className={`${date ? "mt-1" : ""} h-11 rounded-xl ${title}`} />
      </div>
      {button && <Block className={`h-11 rounded-full ${button}`} />}
    </div>
  );
}

/** The horizon tabs (plain words on a line): one bar for each word. */
function Tabs({ words }: { words: string[] }) {
  return (
    <div className="flex h-[52px] items-center gap-5">
      {words.map((w, i) => (
        <Bar key={i} className={`h-4 ${w}`} />
      ))}
    </div>
  );
}

/** A soft tile in a list (`.lf-tiles`): `n` of them, 47 px tall with 8 px between. */
function Tiles({ n, h = "h-[47px]" }: { n: number; h?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: n }, (_, i) => (
        <Block key={i} className={`${h} rounded-2xl`} />
      ))}
    </div>
  );
}

/** A small heading over a few tiles (a to-do group, a day, "Heads up"). */
function Group({ n, h, label = "w-28", head = "h-[23px]" }: { n: number; h?: string; label?: string; head?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-center ${head}`}>
        <Bar className={`h-4 ${label}`} />
      </div>
      <Tiles n={n} h={h} />
    </div>
  );
}

/** The green-to-sky feature card at the top of Money, Goals, Health, Work and School (`lf-sw`, rounded 28 px). */
const HERO = "rounded-[1.75rem]";

/**
 * Today. A phone: the sky from under the top bar down, the skyling's note in the middle, and the chat bar docked above the tabs.
 * A laptop: one rounded sky with the wheel on the left, and on the right the skyling's words, the day's numbers, its line and the
 * ask bar. The heights are the real ones (day-clock.css `.dc`, `.dc-middle` and `--mid`, written out here: that file belongs to
 * the page and isn't loaded yet while this shows).
 */
export function TodaySkeleton() {
  return (
    <Frame label="Loading Today" className="flex flex-col gap-5 [--mid:clamp(6rem,calc(100svh-600px),12rem)]">
      <section className="-mx-5 sm:-mx-8 md:mx-0">
        <div className="relative h-[clamp(260px,calc(100svh-300px-var(--mid)),720px)] md:h-[clamp(560px,calc(100svh-196px),860px)]">
          <Block className="absolute inset-x-0 -top-14 bottom-0 md:inset-0 md:rounded-[2rem]" />
          {/* a phone: the next thing's label and name, low on the sky */}
          <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-3 md:hidden">
            <Bar className="h-3 w-20" />
            <Block className="h-9 w-32 rounded-xl" />
          </div>
          {/* a laptop: the wheel's skyling on the left, the words on the right */}
          <Block className="absolute bottom-24 left-[18%] hidden h-40 w-40 rounded-full md:block" />
          <div className="absolute top-14 right-12 left-[58%] hidden flex-col gap-4 md:flex">
            <Bar className="h-3 w-24" />
            <Block className="h-10 w-48 rounded-xl" />
            <div className="flex gap-2">
              <Bar className="h-7 w-20" />
              <Bar className="h-7 w-20" />
              <Bar className="h-7 w-20" />
            </div>
            <Bar className="h-3 w-64 max-w-full" />
            <Block className="h-24 rounded-3xl" />
            <Block className="h-14 rounded-full" />
          </div>
        </div>
      </section>
      <div className="h-[var(--mid)] md:hidden">
        <div className="flex h-full flex-col items-center justify-center gap-2.5">
          <Bar className="h-4 w-[92%]" />
          <Bar className="h-4 w-[78%]" />
          <Bar className="h-4 w-1/2" />
        </div>
      </div>
      <div className="fixed inset-x-3 bottom-[calc(var(--tabbar-space)-16px)] z-30 mx-auto max-w-md md:hidden">
        <div className="mb-1 flex items-center gap-2 px-1">
          <Block className="h-6 w-6 rounded-full" />
          <Bar className="h-6 w-12" />
        </div>
        <Block className="h-14 rounded-full" />
      </div>
    </Frame>
  );
}

/** Calendar's week list (/plan): the title with Week and Month under it, Add on the right, the filter pills, the days as tiles. */
export function PlanSkeleton() {
  return (
    <Frame label="Loading Plan" className="mx-auto flex max-w-[680px] flex-col gap-8">
      <div className="flex h-[108px] items-end justify-between gap-4">
        <div>
          <Block className="h-10 w-40 rounded-xl" />
          <div className="mt-3 flex h-[52px] items-center gap-5">
            <Bar className="h-4 w-12" />
            <Bar className="h-4 w-14" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Block className="h-11 w-11 rounded-full" />
          <Block className="h-11 w-[90px] rounded-full" />
        </div>
      </div>
      <div className="-my-1.5 flex gap-1.5 py-1.5">
        <Block className="h-11 w-[100px] rounded-full" />
        <Block className="h-11 w-[76px] rounded-full" />
        <Block className="h-11 w-[66px] rounded-full" />
        <Block className="h-11 w-[88px] rounded-full" />
      </div>
      <div className="flex flex-col gap-7">
        <Group n={5} h="h-[47px]" label="w-24" />
        <Group n={2} h="h-[47px]" label="w-28" />
      </div>
    </Frame>
  );
}

/** Calendar's month (/calendar): Week and Month tabs, the month's name with its Today control, the month's grid beside the chosen day. */
export function CalendarSkeleton() {
  return (
    <Frame label="Loading Calendar" className="flex flex-col gap-6">
      <Tabs words={["w-12", "w-14"]} />
      <div className="flex h-[75px] items-center justify-between gap-3 md:h-11">
        <Block className="h-16 w-44 rounded-xl md:h-9 md:w-72" />
        <Block className="h-11 w-36 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Block className="h-[398px] rounded-3xl lg:h-[687px]" />
        <div className="flex flex-col gap-3">
          <div className="flex h-[52px] items-end justify-between gap-3">
            <Block className="h-9 w-40 rounded-xl" />
            <Block className="h-11 w-24 rounded-full" />
          </div>
          <Block className="h-11 rounded-2xl" />
          <Tiles n={3} />
        </div>
      </div>
    </Frame>
  );
}

/**
 * Money: the date and title, the Available now card, three doors as tiles, "Heads up". A laptop puts "This month and the next
 * 30 days" in a second column.
 */
export function MoneySkeleton() {
  return (
    <Frame label="Loading Money" className="mx-auto flex max-w-[640px] flex-col gap-9 lg:grid lg:max-w-[1040px] lg:grid-cols-2 lg:gap-x-10">
      <div className="flex flex-col gap-9">
        <div>
          <Bar className="h-5 w-48" />
          <Block className="mt-1 h-11 w-36 rounded-xl" />
          <Bar className="mt-2 h-4 w-44" />
        </div>
        <Block className={`h-[200px] ${HERO}`} />
        <Tiles n={3} h="h-[66px]" />
        <div>
          <div className="mb-3 flex h-[26px] items-center">
            <Bar className="h-5 w-24" />
          </div>
          <Tiles n={2} h="h-[59px]" />
          <Block className="mt-2 h-11 rounded-2xl" />
        </div>
      </div>
      <div className="lg:pt-[7.5rem]">
        <Block className="h-[66px] rounded-3xl" />
      </div>
    </Frame>
  );
}

/** School: its title and two buttons, the "Next up" card, a card for each class, the Due list in a card. */
export function SchoolSkeleton() {
  return (
    <Frame label="Loading School" className="flex flex-col">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex h-[72px] flex-col justify-end gap-2">
          <Block className="h-10 w-44 rounded-xl" />
          <Bar className="h-3 w-56 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Block className="h-[44px] w-32 rounded-full" />
          <Block className="h-[44px] w-28 rounded-full" />
        </div>
      </div>
      <Block className={`mb-5 h-44 ${HERO}`} />
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Block className="h-[131px] rounded-[1.5rem]" />
      </div>
      <div className="mb-2 flex h-[26px] items-center">
        <Bar className="h-5 w-14" />
      </div>
      <Tabs words={["w-12", "w-16", "w-16", "w-14", "w-10"]} />
      <Block className="mt-4 h-[200px] rounded-3xl" />
    </Frame>
  );
}

/** Notes (under School): the same title row, then the folders on the left (above on a phone) and the notes beside them. */
export function NotesSkeleton() {
  return (
    <Frame label="Loading Notes" className="flex flex-col">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex h-[72px] flex-col justify-end gap-2">
          <Block className="h-10 w-36 rounded-xl" />
          <Bar className="h-3 w-52 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Block className="h-[44px] w-44 rounded-full" />
          <Block className="h-[44px] w-28 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <div className="flex h-[136px] flex-col gap-1 lg:h-auto">
          <Block className="h-11 rounded-lg" />
          <Bar className="mt-4 mb-1 ml-2.5 h-3 w-16" />
          <Bar className="mt-1 ml-2.5 h-3 w-24" />
        </div>
        <div className="flex flex-col gap-4">
          <Block className="h-10 rounded-xl" />
          <Block className="h-[172px] rounded-3xl" />
        </div>
      </div>
    </Frame>
  );
}

/** To-dos: the title, (on a laptop) the add bar, the four tabs, then the groups of to-dos; a phone's add bar sits under the list. */
export function TasksSkeleton() {
  return (
    <Frame label="Loading to-dos" className="flex flex-col">
      <div className="mb-6 flex h-12 items-end">
        <Block className="h-10 w-32 rounded-xl" />
      </div>
      <Block className="mb-6 h-12 rounded-full max-md:hidden" />
      <div className="mb-6">
        <Tabs words={["w-12", "w-12", "w-16", "w-12"]} />
      </div>
      <div className="flex flex-col gap-6">
        <div className="-mt-3 h-4 md:hidden">
          <Bar className="h-3 w-64 max-w-full" />
        </div>
        <Group n={1} h="h-[69px]" label="w-20" />
        <Group n={2} h="h-[69px]" label="w-28" />
        <Group n={3} h="h-[69px]" label="w-24" />
      </div>
      <Block className="mt-4 h-14 rounded-3xl md:hidden" />
    </Frame>
  );
}

/** Goals: date and title with "Goal" on the right, Aiming for / Done, the closest goal's card, then the goals and the habits. */
export function GoalsSkeleton() {
  return (
    <Frame label="Loading Goals" className="mx-auto flex max-w-[640px] flex-col gap-6 lg:max-w-[720px]">
      <Head button="w-24" title="w-36" />
      <Tabs words={["w-20", "w-12"]} />
      <Block className={`h-48 ${HERO}`} />
      <Group n={2} h="h-[68px]" label="w-24" head="h-[26px]" />
      <Group n={1} h="h-[60px]" label="w-24" head="h-[26px]" />
      <Block className="h-[167px] rounded-3xl md:h-[142px]" />
    </Frame>
  );
}

/** Health: date and title with a round "+" on the right, last night's card, "Sleep this week" in a card. */
export function HealthSkeleton() {
  return (
    <Frame label="Loading Health" className="mx-auto flex max-w-[640px] flex-col gap-6">
      <Head button="w-11" title="w-36" />
      <Block className={`h-[281px] ${HERO}`} />
      <div className="flex h-[232px] flex-col gap-3">
        <div className="flex h-[26px] items-center">
          <Bar className="h-5 w-40" />
        </div>
        <Block className="flex-1 rounded-3xl" />
      </div>
    </Frame>
  );
}

/** Work: date and title with "Shift" on the right, the next shift's card, the week, then two folded rows. */
export function WorkSkeleton() {
  return (
    <Frame label="Loading Work" className="mx-auto flex max-w-[640px] flex-col gap-9">
      <Head button="w-24" title="w-28" />
      <Block className={`-mt-4 h-[275px] ${HERO}`} />
      <Block className="h-[674px] rounded-3xl md:h-[634px]" />
      <Block className="h-11 rounded-2xl" />
      <Block className="h-11 rounded-2xl" />
    </Frame>
  );
}

/** The doors' heights: they follow how many lines each one's words take, two across on a phone, three on a wider screen. */
const DOORS = [
  "h-[130px] sm:h-[113px]",
  "h-[130px] sm:h-[113px]",
  "h-[113px]",
  "h-[113px]",
  "h-[130px] sm:h-[113px]",
  "h-[130px] sm:h-[113px]",
  "h-[149px] sm:h-[130px]",
  "h-[149px] sm:h-[130px]",
];

/** Settings (inside its own narrow column): the title, the account's card, then the doors, two across (three on a wide screen). */
export function SettingsSkeleton() {
  return (
    <Frame label="Loading settings" className="flex flex-col gap-5">
      <Block className="h-12 w-44 rounded-xl" />
      <Block className="h-[92px] rounded-[1.375rem]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {DOORS.map((h, i) => (
          <Block key={i} className={`${h} rounded-[1.375rem]`} />
        ))}
      </div>
      <div className="flex h-[164px] flex-col items-center gap-3 pt-2">
        <Block className="h-11 w-32 rounded-full" />
        <Bar className="h-3 w-60 max-w-full" />
      </div>
    </Frame>
  );
}

/** A page of the skyling's (its Profile) inside the shell's header and pills: the skyling and its name centred, then a list of doors. */
export function SkylingProfileSkeleton() {
  return (
    <Frame label="Loading profile" className="mx-auto flex max-w-[640px] flex-col gap-6">
      <div className="flex h-[203px] flex-col items-center pt-2">
        <Block className="h-24 w-24 rounded-[1.5rem]" />
        <Block className="mt-3 h-[43px] w-24 rounded-xl" />
        <div className="flex h-11 items-center">
          <Bar className="h-3 w-28" />
        </div>
      </div>
      <Tiles n={4} h="h-[56px]" />
      <div className="flex flex-col gap-5">
        <Block className="h-[26px] w-44 rounded-xl" />
        <Block className="h-[153px] rounded-3xl" />
        <Block className="h-[634px] rounded-3xl md:h-[517px]" />
      </div>
    </Frame>
  );
}

/** The skyling's Updates: the title and what Ray noticed, then the day's messages as cards, then what it filed. */
export function UpdatesSkeleton() {
  return (
    <Frame label="Loading updates" className="mx-auto flex max-w-[640px] flex-col gap-6">
      <div className="flex h-[67px] flex-col justify-end gap-2">
        <Block className="h-10 w-40 rounded-xl" />
        <Bar className="h-3 w-56 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex h-5 items-center">
          <Bar className="h-4 w-44" />
        </div>
        <Block className="h-[300px] rounded-3xl" />
        <Block className="h-[300px] rounded-3xl" />
      </div>
    </Frame>
  );
}

/** Money's other pages (bills, accounts and the rest): a title with its line, the page's card, then lists of tiles under small headings. */
export function ListSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Frame label={label} className="mx-auto flex max-w-[640px] flex-col gap-7">
      <div className="flex h-[70px] flex-col justify-center">
        <Block className="h-11 w-48 rounded-xl" />
        <Bar className="mt-2 h-4 w-60 max-w-full" />
      </div>
      <Block className={`h-44 ${HERO}`} />
      <Group n={3} h="h-[56px]" label="w-28" />
      <Group n={2} h="h-[56px]" label="w-24" />
    </Frame>
  );
}

/**
 * The skyling's page (owner, 2026-11-18: "the skeleton doesn't even match how the page looks"), the page's own layout: on a
 * laptop the list of earlier chats on the left; then one light row (earlier chats on a phone, the skyling's name, New chat, settings
 * and its picture), the four pills, the skyling's window, a row of clouds under it, the one line about connecting, and the message
 * bar with its small note at the bottom. The wrapper is the real `lf-chat-viewport`, so it fills the screen the same way.
 */
export function ChatSkeleton() {
  return (
    <div className="lf-chat-viewport flex md:h-dvh" aria-busy="true" aria-label="Loading chat" data-app-loading>
      <div className="hidden w-72 shrink-0 flex-col gap-1 py-6 pr-2 pl-1 lg:flex">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5 px-3.5 py-2.5">
            <Bar className="h-4 w-52" />
            <Bar className="h-3 w-14" />
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[52px] items-center gap-0.5 px-2 pt-2 lg:px-4">
          <Block className="m-1 h-8 w-8 rounded-full lg:hidden" />
          <div className="flex min-w-0 flex-1 justify-center px-1 lg:justify-start">
            <Bar className="h-4 w-10" />
          </div>
          <Block className="m-1 h-8 w-8 rounded-full lg:h-9 lg:w-24" />
          <Block className="m-1 h-8 w-8 rounded-full" />
          <Block className="m-1 h-9 w-9 rounded-[0.75rem]" />
        </div>
        <div className="flex h-[60px] items-center gap-1.5 overflow-hidden px-4 py-2">
          <Block className="h-11 w-[85px] shrink-0 rounded-full" />
          <Block className="h-11 w-[107px] shrink-0 rounded-full" />
          <Block className="h-11 w-[95px] shrink-0 rounded-full" />
          <Block className="h-11 w-[119px] shrink-0 rounded-full" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 sm:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-6">
            <div>
              <Block className="h-[220px] rounded-[2rem]" />
              <div className="mt-5 flex gap-3 overflow-hidden py-1">
                <Block className="h-[126px] w-[312px] shrink-0 rounded-2xl" />
                <Block className="h-[126px] w-[312px] shrink-0 rounded-2xl" />
                <Block className="h-[126px] w-[312px] shrink-0 rounded-2xl max-md:hidden" />
              </div>
            </div>
            <Block className="h-[62px] rounded-2xl" />
          </div>
        </div>
        <div className="px-4 pt-4 pb-3 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <Block className="h-16 rounded-full" />
            <Bar className="mx-auto mt-2 h-3 w-60 max-w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
