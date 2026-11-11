"use client";
import { useActionState } from "react";
import type { ActionState } from "@/server/actions";
import { saveNicknameAction } from "./actions";

/** Optional public nickname for the front of the line. The server checks every rule (lib/nickname.ts); this only shows its answer. */
export function NicknameForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveNicknameAction, null);
  return (
    <form action={action} className="mt-5 border-t border-white/10 pt-4" aria-labelledby="wl-nick-h">
      <h3 id="wl-nick-h" className="font-medium">
        Pick a nickname
      </h3>
      <p id="wl-nick-hint" className="mt-1 text-sm leading-relaxed text-white/65">
        Optional. People on the front of the line see it, so skip your full name. 2 to 16 letters or numbers.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="wl-nick" className="sr-only">
          Nickname
        </label>
        <input
          id="wl-nick"
          name="nickname"
          type="text"
          defaultValue={current ?? ""}
          key={current ?? ""}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={40}
          aria-describedby="wl-nick-hint wl-nick-msg"
          aria-invalid={state && !state.ok ? true : undefined}
          placeholder="Night owl"
          className="min-h-11 min-w-0 flex-1 rounded-2xl bg-white/10 px-4 text-[1rem] text-white ring-1 ring-white/20 placeholder:text-white/40 focus:ring-2 focus:ring-star-gold focus:outline-none"
        />
        <button type="submit" disabled={pending} className="lf-sb lf-sb-sun lf-sb-sm">
          Save
        </button>
        {current && (
          <button type="submit" name="intent" value="clear" disabled={pending} formNoValidate className="lf-sb lf-sb-glass lf-sb-sm">
            Clear
          </button>
        )}
      </div>
      <p
        id="wl-nick-msg"
        role={state?.ok === false ? "alert" : "status"}
        className={`mt-2 min-h-5 text-sm ${state?.ok === false ? "text-star-gold" : "text-white/70"}`}
      >
        {state?.ok === false ? state.error : state?.message}
      </p>
    </form>
  );
}
