"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DayClock } from "@/components/day-clock/day-clock";
import { LiveVoice, VoiceButton } from "@/components/jarvis/voice-call";
import { AllFive } from "@/components/skylings/all-five";
import { cheerSkylings } from "@/components/skylings/night";
import { SkyButton } from "@/components/skylings/sky-button";
import { useSkyling } from "@/components/skylings/use-skyling";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import type { PixelName } from "@/components/pixel/art";
import { celebrate } from "@/components/motion/burst";
import { FormError, Input } from "@/components/ui/field";
import { BirthdayField } from "@/components/ui/birthday-field";
import { Sheet } from "@/components/ui/sheet";
import { useShell } from "@/components/shell/app-shell";
import { useLink } from "@/components/finance/plaid-link";
import { ASSISTANT_STYLES, nameAtStart, type AssistantStyle } from "@/lib/assistant";
import { AGE_LINE, BIRTHDAY_NEEDED, birthDateProblem } from "@/lib/birthday";
import { COMPANIONS, companionOf, ownsNight, SKY_CHOICE, SKY_CHOICE_LABEL, type CompanionChoice, type CompanionKey } from "@/lib/companions";
import type { ClockData } from "@/lib/day-clock";
import type { LifeStage } from "@/lib/life";
import type { TodayMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { setAiConsentAction } from "@/app/(app)/settings/actions";
import { connectCanvasFeedAction } from "@/app/(app)/settings/integrations/actions";
import { saveWelcomeAction } from "@/app/(onboarding)/welcome/actions";
import { AskBar } from "./day-plan";
import { TodayOwner, TodayReplyCard, useTodayChat } from "./today-chat";
import { finishSetupAction, saveSchedulePhotoAction } from "./setup-actions";
import type { ScheduleProposal } from "@/server/services/schedule-photo";

/**
 * Setup on the real Today (owner, 2026-11-12: "setup happens inside the real app"; "the skyling takes the new person through
 * their first connection"; "they have to connect one thing first"). It is Today: the same sky, wheel, timeline and chat bar.
 * The skyling's note sits where its note always sits and walks them through it, and each thing to fill in opens in the
 * app's own sheet:
 *   meet (pick and name a skyling) > about (name, birthday, what fills the week) > connect (one real connection, required)
 *   > landed (their week is on the wheel) > learn (turn, open, fold it) > finish.
 * Every server rule of the old welcome is kept (the birthday, under 13, the saved progress, the fixed return from Google and
 * Microsoft); the one new rule is that setup can't finish without a connection (setup-first.ts). Nothing is invented.
 */
type Step = "meet" | "about" | "connect" | "landed" | "learn";
export type SetupSaved = {
  companion: CompanionChoice | null;
  name: string;
  style: AssistantStyle;
  lifeStage: LifeStage | null;
  birthDate: string;
  yourName: string;
};
type Source = { available: boolean; connected: boolean };
export type SetupSources = { canvas: Source; google: Source; outlook: Source; bank: Source; first: string | null };
export type SetupBack = { provider: "google" | "outlook"; result: string } | null;

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;
const BACK_TEXT: Record<string, string> = {
  connected: "is connected.",
  denied: "wasn't connected. That's fine, pick another way.",
  failed: "couldn't connect. Try again, or pick another way.",
  missing_scopes: "needs calendar access to fill your sky. Connect again and leave the calendar box ticked.",
  admin_consent: "needs your school or workplace to approve LifeFlow first. A picture of your schedule works meanwhile.",
  not_configured: "isn't available yet.",
  use_main_site: "connects from the main site. Tap Connect again.",
};
const FIRST_LINE: Record<string, string> = {
  canvas: "Canvas is connected. Your classes and due dates are on the wheel.",
  google: "Google is connected. What's on your calendar is on the wheel.",
  outlook: "Outlook is connected. What's on your calendar is on the wheel.",
  bank: "Your bank is connected. Bills and spending live in Money.",
  classes: "Your classes are on the wheel.",
  plans: "What you told me is on the wheel.",
  shifts: "Your shifts are on the wheel.",
};

export function SetupToday({
  clock,
  saved,
  sources,
  back,
  mode,
  userId,
  aiOk,
}: {
  clock: ClockData;
  saved: SetupSaved;
  sources: SetupSources;
  back: SetupBack;
  mode: TodayMode;
  userId: string;
  aiOk: boolean;
}) {
  const router = useRouter();
  const { reply } = useTodayChat();
  const [stepNow, setStep] = useState<Step>(sources.first ? "landed" : saved.birthDate && saved.lifeStage ? "connect" : saved.companion ? "about" : "meet");
  // a connection that landed (Canvas, a picture, or coming back from Google, Microsoft or the bank) means the week is on the wheel
  const step: Step = sources.first && (stepNow === "meet" || stepNow === "about" || stepNow === "connect") ? "landed" : stepNow;
  const [sheet, setSheet] = useState<null | "meet" | "about" | "connect">(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // the skyling: the one picked (kept on the account as they go), or whoever's moment it is
  const [companion, setCompanion] = useState<CompanionChoice | null>(saved.companion);
  const drawn = useSkyling(companion, clock.tz);
  const [name, setName] = useState(saved.name);
  const [style, setStyle] = useState<AssistantStyle>(saved.style);
  const cleanName = useMemo(() => name.trim().replace(/\s+/g, " "), [name]);
  const nameOk = cleanName.length === 0 || (cleanName.length <= 24 && NAME_RE.test(cleanName));
  const chosen = companion && companion !== SKY_CHOICE ? companionOf(companion) : null;
  // until one is picked it goes by the app's own default (Ray), like everywhere else in the app
  const shell = useShell();
  const who = (cleanName && nameOk ? cleanName : null) ?? (companion && drawn ? companionOf(drawn).name : shell.assistantName);

  // about you
  const [yourName, setYourName] = useState(saved.yourName);
  const cleanYou = yourName.trim().replace(/\s+/g, " ");
  const [birthDate, setBirthDate] = useState(saved.birthDate);
  const [stage, setStage] = useState<LifeStage | null>(saved.lifeStage);
  const typed = birthDate ? birthDateProblem(birthDate, clock.today) : null;
  const birthProblem = typed === AGE_LINE ? null : typed;
  const [busy, setBusy] = useState(false);

  const [aiOn, setAiOn] = useState(aiOk);

  const open = (s: "meet" | "about" | "connect") => {
    setError(null);
    setSheet(s);
  };

  const savePick = async () => {
    if (!companion || !nameOk) return;
    setBusy(true);
    const r = await saveWelcomeAction({ assistant: { name: cleanName || undefined, style, companion } });
    setBusy(false);
    if (!r?.ok) return setError(r?.error ?? "Couldn't save. Try again.");
    setSheet(null);
    setStep("about");
    router.refresh();
  };
  const saveAbout = async () => {
    if (birthProblem) return setError(birthProblem);
    setBusy(true);
    const r = await saveWelcomeAction({
      assistant: { name: cleanName || undefined, style, companion: companion ?? undefined },
      name: cleanYou || undefined,
      birthDate,
      lifeStage: stage ?? undefined,
    });
    setBusy(false);
    // under 13: the account is locked and Today sends them to the one calm line (nothing to retry)
    if (r?.error === AGE_LINE) return router.refresh();
    if (!r?.ok) return setError(r?.error ?? "Couldn't save. Try again.");
    setSheet(null);
    setStep("connect");
    router.refresh();
  };
  const landedBy = (msg: string | null) => {
    setLanded(msg);
    setSheet(null);
    setStep("landed");
    cheerSkylings();
    router.refresh();
  };
  const finish = async () => {
    setBusy(true);
    setError(null);
    const r = await finishSetupAction();
    if (r?.ok) return router.refresh();
    setBusy(false);
    if (r?.error === BIRTHDAY_NEEDED) {
      setStep("about");
      open("about");
    }
    setError(r?.error ?? "Couldn't finish. Try again.");
  };

  const first = cleanYou.split(" ")[0] || "there";
  const note = (() => {
    switch (step) {
      case "meet":
        return {
          text: "Hi, I'm one of the skylings who live in this sky. One of us will sit on top of yours. Want to meet us?",
          button: "Meet the skylings",
          go: () => open("meet"),
        };
      case "about":
        return { text: `I'm ${who}. What should I call you, and when's your birthday?`, button: "About you", go: () => open("about") };
      case "connect":
        return {
          text: back
            ? `${back.provider === "google" ? "Google" : "Outlook"} ${BACK_TEXT[back.result] ?? "didn't connect."}`
            : `Hi ${first}. I need one thing on your sky before we start: something real from your week. A picture of your schedule is the quickest.`,
          button: "Pick the first one",
          go: () => open("connect"),
        };
      case "landed":
        return {
          text: `${landed ?? FIRST_LINE[sources.first ?? ""] ?? "That's on your sky."} Look up, ${first}: that's your week. Want to see how to read it?`,
          button: "Show me how to read it",
          go: () => setStep("learn"),
        };
      case "learn":
        return null;
    }
  })();

  const cloud =
    reply && step !== "landed" ? (
      <TodayReplyCard name={who} refresh={() => router.refresh()} fill />
    ) : step === "learn" ? (
      <Learn who={who} glyph={drawn} onFinish={finish} busy={busy} error={error} />
    ) : (
      note && (
        <SkylingNote glyph={drawn} who={who} text={note.text} error={step === "meet" || step === "about" ? null : error}>
          <SkyButton onClick={note.go} skyling={drawn ?? "dawn"} size="sm" className="self-start">
            {note.button}
          </SkyButton>
        </SkylingNote>
      )
    );

  return (
    <div className="dc-today flex flex-col gap-5" data-setup={step}>
      <h1 className="sr-only">Set up your sky</h1>
      <TodayOwner userId={userId} />
      <section aria-label="Your day" className="-mx-5 sm:-mx-8 md:mx-0">
        {/* connecting and landing: opened into the week, so what came in lands on its day; learning: folded back to turn and open */}
        <DayClock data={clock} mode={mode} companion={companion} open={step === "landed" ? true : step === "learn" ? false : undefined}>
          <div className="max-md:hidden" data-testid="setup-note-wide">
            {cloud}
          </div>
          <div className="dc-ask">
            <AskBar name={who} chips={false} />
          </div>
        </DayClock>
      </section>
      <div className="dc-middle md:hidden" data-testid="setup-note">
        {cloud}
      </div>
      <div className="dc-dock md:hidden">
        <AskBar name={who} chips={false} answer={false} />
      </div>

      <Sheet open={sheet === "meet"} onClose={() => setSheet(null)} title="Meet the skylings">
        <MeetSheet
          companion={companion}
          chosen={chosen}
          name={name}
          setName={setName}
          nameOk={nameOk}
          cleanName={cleanName}
          onPick={(c, tone) => {
            const known = COMPANIONS.some((x) => x.name === cleanName);
            if (c === SKY_CHOICE) {
              if (known) setName("");
            } else if (!cleanName || known) setName(companionOf(c as CompanionKey).name);
            setCompanion(c);
            setStyle(tone);
            cheerSkylings();
          }}
          busy={busy}
          error={error}
          onDone={savePick}
          who={who}
          glyph={drawn}
        />
      </Sheet>
      <Sheet open={sheet === "about"} onClose={() => setSheet(null)} title="About you">
        <div className="flex flex-col gap-5 pt-1">
          <p className="text-[0.9375rem] text-text-2">{nameAtStart(who)} plans around you. All of this stays private to your account.</p>
          <Field label="What should I call you?">
            <Input
              aria-label="What should I call you?"
              value={yourName}
              onChange={(e) => setYourName(e.target.value)}
              maxLength={80}
              autoComplete="given-name"
              className="min-h-11"
            />
          </Field>
          <Field label="Your birthday">
            <BirthdayField value={birthDate} onChange={setBirthDate} invalid={!!birthProblem} />
            <p className={cn("mt-1.5 text-xs", birthProblem ? "text-danger" : "text-muted")}>{birthProblem ?? "Private to your account."}</p>
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-text-2">What fills your week?</p>
            <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="What fills your week">
              {(
                [
                  ["student", "Classes", "I'm a student", "class"],
                  ["working", "Work", "I have a job", "shift"],
                  ["both", "Both", "Classes and a job", "calendar"],
                  ["life", "Neither", "My life, money and goals", "today"],
                ] as const
              ).map(([value, label, hint, icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={stage === value}
                  onClick={() => setStage(value)}
                  className={cn(
                    "flex min-h-11 flex-col items-start gap-1 rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98]",
                    stage === value ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night shadow-lift ring-2 ring-dawn-3" : "bg-surface-2",
                  )}
                >
                  <PixelIcon name={icon} className="h-6 w-6" />
                  <span className="text-[1rem] font-medium">{label}</span>
                  <span className={cn("text-xs", stage === value ? "text-ink-night/75" : "text-muted")}>{hint}</span>
                </button>
              ))}
            </div>
          </div>
          {error && <FormError message={error} />}
          <SkyButton
            onClick={saveAbout}
            loading={busy}
            disabled={!cleanYou || !stage || !birthDate || !!birthProblem}
            skyling={drawn ?? "dawn"}
            className="w-full justify-between pl-6"
          >
            Continue
          </SkyButton>
        </div>
      </Sheet>
      <Sheet open={sheet === "connect" && step !== "landed"} onClose={() => setSheet(null)} title="Your first connection">
        <ConnectSheet
          who={who}
          stage={stage}
          sources={sources}
          aiOn={aiOn}
          onAllowed={() => setAiOn(true)}
          onTold={() => router.refresh()}
          onLanded={(msg, at) => {
            celebrate(at, "small", "Connected");
            landedBy(msg);
          }}
        />
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text-2">{label}</p>
      {children}
    </div>
  );
}

/** The skyling's note where its note always sits on Today: its picture, its name and its words, with the next step under them. */
function SkylingNote({
  glyph,
  who,
  text,
  error,
  children,
}: {
  glyph: CompanionKey | null;
  who: string;
  text: string;
  error: string | null;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={`From ${who}`}
      className="lf-reply flex items-start gap-3 rounded-[1.5rem] bg-surface px-4 py-3 shadow-soft ring-1 ring-border/60 max-md:h-full max-md:overflow-y-auto"
    >
      <CompanionGlyph companion={glyph} night={ownsNight(glyph)} pose="celebrate" frame={3} className="lf-breathe mt-0.5 h-12 w-12 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <p className="text-xs font-medium text-muted">{who}</p>
        <p data-testid="setup-words" className="text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">
          {text}
        </p>
        {children}
        {error && <FormError message={error} />}
      </div>
    </section>
  );
}

function MeetSheet({
  companion,
  chosen,
  name,
  setName,
  nameOk,
  cleanName,
  onPick,
  busy,
  error,
  onDone,
  who,
  glyph,
}: {
  companion: CompanionChoice | null;
  chosen: ReturnType<typeof companionOf> | null;
  name: string;
  setName: (n: string) => void;
  nameOk: boolean;
  cleanName: string;
  onPick: (c: CompanionChoice, tone: AssistantStyle) => void;
  busy: boolean;
  error: string | null;
  onDone: () => void;
  who: string;
  glyph: CompanionKey | null;
}) {
  const card = (on: boolean) =>
    cn(
      "flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 py-2 transition-all duration-300 active:scale-95",
      on ? "-translate-y-0.5 bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night shadow-lift ring-2 ring-dawn-3" : "bg-surface-2",
    );
  return (
    <div className="flex flex-col gap-5 pt-1">
      <p className="text-[0.9375rem] text-text-2">Pick yours, a little one from the sky who keeps an eye on your day.</p>
      <div role="radiogroup" aria-label="Your skyling" className="grid grid-cols-3 gap-2">
        {COMPANIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={companion === c.key}
            onClick={() => onPick(c.key, c.tone)}
            className={card(companion === c.key)}
          >
            <CompanionGlyph
              companion={c.key}
              night={ownsNight(c.key)}
              pose={companion === c.key ? "celebrate" : "idle"}
              frame={companion === c.key ? 1 : 0}
              className="h-12 w-12"
            />
            <span className="text-[0.9375rem] font-medium">{c.name}</span>
            <span className={cn("text-xs", companion === c.key ? "text-ink-night/75" : "text-muted")}>{c.moment}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={companion === SKY_CHOICE}
          onClick={() => onPick(SKY_CHOICE, "friend")}
          className={card(companion === SKY_CHOICE)}
        >
          <AllFive />
          <span className="text-center text-[0.9375rem] leading-tight font-medium">{SKY_CHOICE_LABEL.name}</span>
          <span className={cn("text-xs", companion === SKY_CHOICE ? "text-ink-night/75" : "text-muted")}>{SKY_CHOICE_LABEL.moment}</span>
        </button>
      </div>
      {companion === SKY_CHOICE && (
        <p className="-mt-2 text-sm leading-relaxed text-text-2" aria-live="polite">
          <span className="font-medium text-text">{SKY_CHOICE_LABEL.line}</span> Same name and the same way of talking all day.
        </p>
      )}
      {chosen && (
        <p className="-mt-2 text-sm leading-relaxed text-text-2" aria-live="polite">
          <span className="font-medium text-text">{chosen.line}</span> Best at {chosen.skill.charAt(0).toLowerCase() + chosen.skill.slice(1)} Talks like a{" "}
          {ASSISTANT_STYLES[chosen.tone].label.toLowerCase()}.
        </p>
      )}
      <Field label="Its name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="your skyling"
          aria-label="Skyling's name"
          autoCapitalize="words"
          autoComplete="off"
          className="min-h-11 text-[1rem]"
        />
        <p className="mt-1.5 text-xs text-muted">{chosen ? "Keep the name or type your own." : "Optional. Pick one above, or type a name."}</p>
        {!nameOk && <p className="mt-1 text-xs text-danger">Use letters, numbers, spaces or simple punctuation (up to 24 characters).</p>}
        <div className="mt-3 flex gap-2.5 rounded-2xl bg-surface-2 p-3.5" aria-live="polite">
          <CompanionGlyph companion={glyph} className="h-7 w-7" />
          <p className="text-[0.875rem] leading-relaxed text-text-2">
            <span className="font-semibold text-text">{cleanName && nameOk ? cleanName : who}:</span>{" "}
            {chosen ? chosen.sample : "You've got 2 things due this week. Let's start the big one Tuesday. You've got this."}{" "}
            {/* the numbers in a sample line are made up (research 2026-11-09, rule 6) */}
            <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-medium text-muted">Example</span>
          </p>
        </div>
      </Field>
      {error && <FormError message={error} />}
      <SkyButton
        onClick={onDone}
        loading={busy}
        disabled={!companion || !nameOk}
        skyling={glyph ?? "dawn"}
        cheer={!!companion}
        className="w-full justify-between pl-6"
      >
        This one
      </SkyButton>
    </div>
  );
}

type Way = "photo" | "canvas" | "google" | "outlook" | "bank";

/**
 * The first connection, one list: a picture of a schedule (anyone can do this one), Canvas, Google, Outlook, the bank. Each says
 * what it brings; one real success lets setup finish. The bank is last and plainly optional (it puts nothing on the wheel).
 */
function ConnectSheet({
  who,
  stage,
  sources,
  aiOn,
  onAllowed,
  onLanded,
  onTold,
}: {
  who: string;
  stage: LifeStage | null;
  sources: SetupSources;
  aiOn: boolean;
  onAllowed: () => void;
  onLanded: (message: string | null, at: DOMRect | undefined) => void;
  /** A message or a spoken week was sent: the page is asked again, and only rows that really saved move setup on. */
  onTold: () => void;
}) {
  const [view, setView] = useState<"list" | Way | "none">("list");
  const school = stage === "student" || stage === "both";
  const order: Way[] = school ? ["photo", "canvas", "google", "outlook", "bank"] : ["photo", "google", "outlook", "canvas", "bank"];
  const back = (
    <button
      type="button"
      onClick={() => setView("list")}
      className="-ml-2 mb-3 flex min-h-11 items-center gap-1 rounded-full px-2 text-sm text-muted hover:text-text"
    >
      <PixelIcon name="back" className="h-4 w-4" /> All the ways
    </button>
  );
  if (view === "photo")
    return (
      <div>
        {back}
        <PhotoWay who={who} aiOn={aiOn} onAllowed={onAllowed} onSaved={(m) => onLanded(m, undefined)} />
      </div>
    );
  if (view === "canvas")
    return (
      <div>
        {back}
        <CanvasWay onConnected={(m, at) => onLanded(m, at)} />
      </div>
    );
  if (view === "none")
    return (
      <div>
        {back}
        <TellWay who={who} aiOn={aiOn} onAllowed={onAllowed} onSent={onTold} />
      </div>
    );
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <p className="mb-1 text-[0.9375rem] text-text-2">
        Pick one. It puts your real week on your sky and keeps it up to date, so you never type it in. You can add the rest later.
      </p>
      {order.map((w) => (
        <WayCard key={w} way={w} sources={sources} recommended={w === "photo"} onOpen={() => setView(w)} />
      ))}
      <button type="button" onClick={() => setView("none")} className="mt-1 min-h-11 self-start text-sm font-medium text-accent hover:underline">
        Nothing here works for me
      </button>
    </div>
  );
}

const WAYS: Record<Way, { title: string; brings: string; icon: PixelName }> = {
  photo: { title: "A picture of your schedule", brings: "Classes or work shifts, from a screenshot or a photo. Works for anyone.", icon: "upload" },
  canvas: { title: "Canvas", brings: "Every assignment and due date, from all your classes.", icon: "school" },
  google: { title: "Google", brings: "Calendar and Gmail: your plans, bills and receipts.", icon: "calendar" },
  outlook: { title: "Outlook and Teams", brings: "School or work calendar, and Teams meetings.", icon: "chat" },
  bank: { title: "Your bank", brings: "What's available now, and your bills. Read-only: LifeFlow can't move money.", icon: "card" },
};

function WayCard({ way, sources, recommended, onOpen }: { way: Way; sources: SetupSources; recommended: boolean; onOpen: () => void }) {
  const w = WAYS[way];
  const src = way === "photo" ? { available: true, connected: false } : sources[way];
  const bank = useLink();
  const label = way === "bank" ? (bank.busy ? "Opening…" : "Connect") : way === "photo" ? "Add a picture" : "Connect";
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-4 py-3.5" data-way={way}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface max-[359px]:hidden">
          <PixelIcon name={w.icon} className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">
            {w.title}
            {recommended && (
              <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-[0.6875rem] font-medium text-accent">Quickest</span>
            )}
          </span>
          <span className="block text-sm text-muted">{w.brings}</span>
        </span>
      </div>
      {!src.available ? (
        <span className="block pl-[3.25rem] text-xs text-muted max-[359px]:pl-0">Isn&apos;t available yet</span>
      ) : way === "google" || way === "outlook" ? (
        <a
          href={way === "google" ? "/api/integrations/google/start?from=welcome" : "/api/integrations/microsoft/start?from=welcome"}
          className="lf-sb lf-sb-sun lf-sb-sm self-end"
          aria-label={`Connect ${w.title}`}
        >
          {label}
        </a>
      ) : (
        <button
          type="button"
          onClick={way === "bank" ? bank.start : onOpen}
          disabled={way === "bank" && bank.busy}
          className="lf-sb lf-sb-sun lf-sb-sm self-end"
          aria-label={way === "photo" ? "Add a picture of your schedule" : `Connect ${w.title}`}
        >
          {label}
        </button>
      )}
      {way === "bank" && bank.status && (
        <span role="status" className={cn("block text-xs", bank.status.ok ? "text-text-2" : "text-danger")}>
          {bank.status.text}
        </span>
      )}
    </div>
  );
}

/** Canvas: the Calendar Feed link, pasted right here, with the same help as Settings. */
function CanvasWay({ onConnected }: { onConnected: (message: string | null, at: DOMRect | undefined) => void }) {
  const [feed, setFeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const connect = async () => {
    setBusy(true);
    setProblem(null);
    const fd = new FormData();
    fd.set("feed", feed.trim());
    const r = await connectCanvasFeedAction(null, fd);
    setBusy(false);
    if (!r?.ok) return setProblem(r?.error ?? "Couldn't connect Canvas. Check the link and try again.");
    onConnected(r.message ?? null, btn.current?.getBoundingClientRect());
  };
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-lg font-medium">Canvas</h3>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-text-2">
        <li>Open Canvas in a browser and go to Calendar.</li>
        <li>Tap Calendar Feed (bottom right) and copy the link.</li>
        <li>Paste it here. LifeFlow only reads due dates and class events.</li>
      </ol>
      <Input
        type="url"
        inputMode="url"
        value={feed}
        onChange={(e) => setFeed(e.target.value)}
        placeholder="https://…/feeds/calendars/user_….ics"
        aria-label="Calendar Feed link"
        autoCapitalize="none"
        autoCorrect="off"
        className="min-h-11"
      />
      {problem && <FormError message={problem} />}
      <SkyButton ref={btn} type="button" disabled={!feed.trim()} loading={busy} onClick={connect} className="w-full justify-between pl-6">
        Connect Canvas
      </SkyButton>
    </div>
  );
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clockWords = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const dayWords = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

type Item = { key: string; title: string; when: string };
function itemsOf(p: ScheduleProposal): Item[] {
  const out: Item[] = [];
  p.classes?.forEach((c, i) =>
    out.push({
      key: `c${i}`,
      title: c.name,
      when: `${[...c.days]
        .sort()
        .map((d) => DAY[d])
        .join(" ")} · ${clockWords(c.startTime)} to ${clockWords(c.endTime)}${c.location ? ` · ${c.location}` : ""}`,
    }),
  );
  p.jobs?.forEach((j, ji) => {
    j.weekly?.forEach((w, wi) =>
      out.push({
        key: `w${ji}.${wi}`,
        title: `${j.name}, every week`,
        when: `${[...w.days]
          .sort()
          .map((d) => DAY[d])
          .join(" ")} · ${clockWords(w.startTime)} to ${clockWords(w.endTime)}`,
      }),
    );
    j.shifts?.forEach((s, si) =>
      out.push({ key: `s${ji}.${si}`, title: j.name, when: `${dayWords(s.date)} · ${clockWords(s.startTime)} to ${clockWords(s.endTime)}` }),
    );
  });
  return out;
}
function keep(p: ScheduleProposal, on: Set<string>): ScheduleProposal {
  return {
    classes: (p.classes ?? []).filter((_, i) => on.has(`c${i}`)),
    jobs: (p.jobs ?? [])
      .map((j, ji) => ({
        ...j,
        weekly: (j.weekly ?? []).filter((_, wi) => on.has(`w${ji}.${wi}`)),
        shifts: (j.shifts ?? []).filter((_, si) => on.has(`s${ji}.${si}`)),
      }))
      .filter((j) => j.weekly.length || j.shifts.length),
  };
}

/**
 * A picture of a class or work schedule, end to end: choose it, the skyling reads it, the person checks what it found (one
 * tap to add, each line can be unticked), and what they keep goes on the wheel. Nothing is saved before that tap and the
 * picture itself isn't kept.
 */
function PhotoWay({ who, aiOn, onAllowed, onSaved }: { who: string; aiOn: boolean; onAllowed: () => void; onSaved: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading" | "review" | "empty">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ScheduleProposal | null>(null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const read = async (file: File | undefined) => {
    if (!file) return;
    setState("reading");
    setProblem(null);
    try {
      if (!aiOn) {
        const c = await setAiConsentAction(true);
        if (!c?.ok) throw new Error(c?.error || "Couldn't read that just now. Try again.");
        onAllowed();
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/setup/schedule", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { proposal?: ScheduleProposal; error?: string } | null;
      if (!res.ok || !data?.proposal) throw new Error(data?.error || "Couldn't read that just now. Try again.");
      const items = itemsOf(data.proposal);
      setProposal(data.proposal);
      setOn(new Set(items.map((i) => i.key)));
      setState(items.length ? "review" : "empty");
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "Couldn't read that just now. Try again.");
      setState("idle");
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  const save = async () => {
    if (!proposal) return;
    setSaving(true);
    const r = await saveSchedulePhotoAction(keep(proposal, on));
    setSaving(false);
    if (!r?.ok) return setProblem(r?.error ?? "That didn't save. Try again.");
    onSaved(r.message ?? null);
  };
  const items = proposal ? itemsOf(proposal) : [];
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-lg font-medium">A picture of your schedule</h3>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="schedule-file"
        onChange={(e) => read(e.target.files?.[0])}
      />
      {state === "review" ? (
        <>
          <p className="text-sm text-text-2">
            {nameAtStart(who)} found this. Untick anything that isn&apos;t right, then add it. Nothing goes on your sky until you do.
          </p>
          <ul className="flex flex-col gap-2" aria-label="What was found">
            {items.map((i) => (
              <li key={i.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on.has(i.key)}
                  onClick={() => setOn((s) => (s.has(i.key) ? new Set([...s].filter((k) => k !== i.key)) : new Set([...s, i.key])))}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-colors",
                    on.has(i.key) ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night" : "bg-surface-2",
                  )}
                >
                  <PixelIcon name={on.has(i.key) ? "todo" : "box"} className="h-6 w-6 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-medium">{i.title}</span>
                    <span className={cn("block text-sm", on.has(i.key) ? "text-ink-night/75" : "text-muted")}>{i.when}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {problem && <FormError message={problem} />}
          <SkyButton onClick={save} loading={saving} disabled={on.size === 0} className="w-full justify-between pl-6">
            Add {on.size === 1 ? "this" : `these ${on.size}`} to my sky
          </SkyButton>
          <button type="button" onClick={() => input.current?.click()} className="min-h-11 self-start text-sm font-medium text-accent hover:underline">
            Not right? Try another picture
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-text-2">
            A screenshot of your class schedule or your work schedule. {nameAtStart(who)} reads the times and you check them before anything is added. The
            picture isn&apos;t kept.
          </p>
          {!aiOn && (
            <p className="text-xs text-muted">
              To read it, {nameAtStart(who)} sends the picture to OpenAI, our provider, who don&apos;t use it to train their models. Choosing a picture allows
              this. You can turn it off anytime in Settings.
            </p>
          )}
          {state === "empty" && (
            <p role="status" className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-text-2">
              {nameAtStart(who)} couldn&apos;t find classes or shifts in that picture. Try a clearer one, or one that shows the days and times.
            </p>
          )}
          {state === "reading" && (
            <p role="status" className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-text-2">
              {nameAtStart(who)} is reading your schedule…
            </p>
          )}
          {problem && <FormError message={problem} />}
          <SkyButton onClick={() => input.current?.click()} disabled={state === "reading"} className="w-full justify-between pl-6">
            {state === "reading" ? "Reading…" : "Choose a picture"}
          </SkyButton>
        </>
      )}
    </div>
  );
}

/**
 * Learning the sky by doing it, on their own wheel above: turn it, open it into the week, fold it back. Each is ticked when the
 * wheel says it happened (its data-state, and a drag on it), as in the old welcome. "Go to my sky" is always there.
 */
function Learn({ who, glyph, onFinish, busy, error }: { who: string; glyph: CompanionKey | null; onFinish: () => void; busy: boolean; error: string | null }) {
  const [done, setDone] = useState({ turn: false, open: false, fold: false });
  useEffect(() => {
    const dc = document.querySelector<HTMLElement>("[data-testid=day-clock]");
    if (!dc) return;
    let opened = false;
    const watch = new MutationObserver(() => {
      const s = dc.dataset.state;
      if (s === "timeline") {
        opened = true;
        setDone((d) => ({ ...d, open: true }));
      }
      if (s === "clock" && opened) setDone((d) => ({ ...d, fold: true }));
    });
    watch.observe(dc, { attributes: true, attributeFilter: ["data-state"] });
    let from: number | null = null;
    const down = (e: PointerEvent) => (from = e.clientX);
    const move = (e: PointerEvent) => {
      if (from != null && Math.abs(e.clientX - from) > 28 && dc.dataset.state === "clock") setDone((d) => ({ ...d, turn: true }));
    };
    const up = () => (from = null);
    const turned = () => setDone((d) => ({ ...d, turn: true }));
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") turned();
    };
    dc.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    dc.addEventListener("wheel", turned, { passive: true });
    dc.addEventListener("keydown", key);
    return () => {
      watch.disconnect();
      dc.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dc.removeEventListener("wheel", turned);
      dc.removeEventListener("keydown", key);
    };
  }, []);
  const rows: [keyof typeof done, string, string][] = [
    ["turn", "Turn it", "Drag the sky sideways. Now is at the top."],
    ["open", "Open it", "Tap the sky. It pours into a line of your week."],
    ["fold", "Fold it back", "Pull the line down, or tap Back to now."],
  ];
  const next = rows.find(([k]) => !done[k]);
  return (
    <section
      aria-label="Read your sky"
      className="lf-reply flex flex-col gap-2 rounded-[1.5rem] bg-surface px-4 py-3 shadow-soft ring-1 ring-border/60 max-md:h-full max-md:overflow-y-auto"
    >
      <p data-testid="setup-words" className="text-[0.9375rem] leading-snug">
        {next ? `${nameAtStart(who)}: ${next[2]}` : "That's all there is to it. It's yours now."}
      </p>
      <ol className="flex flex-wrap gap-1.5" aria-label="Read your sky">
        {rows.map(([k, t]) => (
          <li
            key={k}
            className={cn(
              "flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-300",
              done[k] ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night" : "bg-surface-2 text-text-2",
            )}
          >
            <PixelIcon name={done[k] ? "todo" : "box"} className="h-4 w-4" />
            {t}
            {done[k] && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>
      {error && <FormError message={error} />}
      <SkyButton onClick={onFinish} loading={busy} skyling={glyph ?? "ray"} size="sm" className="self-start">
        Go to my sky
      </SkyButton>
    </section>
  );
}

/**
 * The path for anyone with nothing to connect (owner, 2026-11-12: "they can send a message too or send a voice"): tell the
 * skyling the week in one message, typed or said. It goes through the same chat as everywhere (its limits, its permission,
 * `set_up_schedule`), and only what it really saves counts: the server reads the account's own rows, so if nothing was saved,
 * setup still waits and says so.
 */
function TellWay({ who, aiOn, onAllowed, onSent }: { who: string; aiOn: boolean; onAllowed: () => void; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const fallback = `${nameAtStart(who)} couldn't save that just now. Try again.`;
  /** Talking needs the same permission as sending: asked in the words above, allowed by choosing to talk. */
  const talk = async () => {
    setProblem(null);
    if (!aiOn) {
      const r = await setAiConsentAction(true);
      if (!r?.ok) return setProblem(r?.error || fallback);
      onAllowed();
    }
    setTalking(true);
  };
  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setProblem(null);
    setSaid(null);
    try {
      if (!aiOn) {
        const r = await setAiConsentAction(true);
        if (!r?.ok) throw new Error(r?.error || fallback);
        onAllowed();
      }
      const { reply, saved } = await askSkyling(message, fallback);
      setSaid(reply || (saved ? "Saved." : null));
      if (saved) {
        setText("");
        onSent();
      } else setProblem(`Nothing was added to your sky yet. Tell ${nameAtStart(who)} the days and times, like the example above.`);
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="no-connection" className="flex flex-col gap-3">
      <h3 className="font-display text-lg font-medium">Tell {nameAtStart(who)} your week</h3>
      <p className="text-sm text-text-2">
        Nothing to connect? Type it or say it, in your own words. For example: &quot;Bio 101 Mon and Wed at 10, I work at Target Tue and Thu 5 to 9.&quot; It
        goes on your sky only when {nameAtStart(who)} saves it, and you can undo it. Setup waits until something is on your sky.
      </p>
      {!aiOn && (
        <p className="text-xs text-muted">
          To read it, {nameAtStart(who)} sends your message to OpenAI, our provider, who don&apos;t use it to train their models. Sending or talking allows
          this. You can turn it off anytime in Settings.
        </p>
      )}
      {talking ? (
        <LiveVoice
          module="calendar"
          assistantName={who}
          conversationId={null}
          onConversation={() => undefined}
          onLine={() => undefined}
          onTool={() => undefined}
          onConfirmation={() => undefined}
          onEnd={(error) => {
            setTalking(false);
            if (error) setProblem(error);
            onSent(); // the page is asked again: what the call saved shows, and nothing else moves setup on
          }}
        />
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            aria-label={`Tell ${who} your week`}
            placeholder="Bio 101 Mon and Wed at 10, work at Target Tue and Thu 5 to 9"
            className="w-full resize-none rounded-2xl bg-surface-2 px-4 py-3 text-[1rem] outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
          />
          <div className="flex items-center gap-2">
            <SkyButton onClick={send} loading={busy} disabled={!text.trim()} className="min-w-0 flex-1 justify-between pl-6">
              {aiOn ? "Send" : "Allow and send"}
            </SkyButton>
            <VoiceButton assistantName={who} disabled={busy} onStart={talk} className="bg-surface-2" />
          </div>
        </>
      )}
      {said && (
        <p role="status" className="line-clamp-6 text-sm [overflow-wrap:anywhere] text-text-2">
          {said}
        </p>
      )}
      {problem && <FormError message={problem} />}
    </div>
  );
}

/** One message to the skyling through the same chat as everywhere: its final words, and whether a tool saved something. */
async function askSkyling(message: string, fallback: string): Promise<{ reply: string; saved: boolean }> {
  const res = await fetch("/api/jarvis/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, attachmentIds: [], clientMessageId: crypto.randomUUID(), module: "calendar" }),
  });
  if (!res.ok || !res.body) {
    // only words the server wrote for people (limits, permission); anything else is the calm fallback
    const words = [402, 403, 429, 503].includes(res.status) ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : null;
    throw new Error(words || fallback);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let reply = "";
  let saved = false;
  let failed = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as { type: string; delta?: string; ok?: boolean; message?: string };
      if (ev.type === "tool_start") reply = "";
      if (ev.type === "text") reply += ev.delta ?? "";
      if (ev.type === "tool_end" && ev.ok) saved = true;
      if (ev.type === "error") failed = ev.message ?? "";
    }
  }
  if (failed && !saved) throw new Error(failed);
  return { reply: reply.trim(), saved };
}
