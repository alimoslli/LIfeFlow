"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { neededOnFinal } from "@/lib/grades";
import type { ActionState } from "@/server/actions";

const KINDS = [
  ["exam", "Exams"],
  ["quiz", "Quizzes"],
  ["assignment", "Homework"],
  ["project", "Projects"],
  ["lab", "Labs"],
  ["discussion", "Discussion"],
] as const;
const TARGETS = [
  [93, "A"],
  [90, "A-"],
  [83, "B"],
  [80, "B-"],
  [73, "C"],
  [70, "C-"],
] as const;

/** Current grade, "what do I need on the final", and the class's weights from the syllabus. */
export function GradeCard({
  grade,
  weights,
  action,
}: {
  grade: { percent: number; letter: string; graded: number; countedWeight: number | null } | null;
  weights: Record<string, number> | null;
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [finalWeight, setFinalWeight] = useState(String(weights?.exam ? Math.min(weights.exam, 40) : 25));
  const [target, setTarget] = useState(90);
  const need = grade ? neededOnFinal(grade.percent, Number(finalWeight) || 0, target) : null;
  return (
    <section aria-label="Grade" className="rounded-3xl bg-surface p-5 shadow-soft">
      <h2 className="text-[15px] font-semibold">Grade</h2>
      {grade ? (
        <>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="tabular font-display text-[40px] leading-none font-medium">{grade.percent}%</span>
            <span className="text-lg font-medium text-text-2">{grade.letter}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            From {grade.graded} graded item{grade.graded === 1 ? "" : "s"}
            {grade.countedWeight != null && grade.countedWeight < 100 ? `, covering ${grade.countedWeight}% of the class` : ""}.
          </p>
          <div className="mt-4 rounded-2xl bg-surface-2 p-4">
            <p className="text-sm font-medium">What do I need on the final?</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-2">
                Final is worth (%)
                <input
                  inputMode="numeric"
                  value={finalWeight}
                  onChange={(e) => setFinalWeight(e.target.value.replace(/[^\d.]/g, ""))}
                  className="h-11 rounded-xl bg-surface px-3 text-[15px] text-text"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-2">
                I want at least
                <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className="h-11 rounded-xl bg-surface px-3 text-[15px] text-text">
                  {TARGETS.map(([p, l]) => (
                    <option key={l} value={p}>
                      {l} ({p}%)
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {need !== null && (
              <p className="mt-3 text-[15px]" role="status">
                {need > 100
                  ? `You'd need ${need}% on the final, so that grade is out of reach. Aim one step lower or ask about extra credit.`
                  : need <= 0
                    ? "You already have it, even with a 0 on the final."
                    : `You need ${need}% on the final.`}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-2">Add grades to assignments (like 45/50 or 92%) and your grade shows here.</p>
      )}
      <details className="mt-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent">How the class is weighted</summary>
        <ActionForm action={action} reset={false} showSuccess className="mt-2">
          <div className="grid grid-cols-2 gap-3">
            {KINDS.map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1 text-xs text-text-2">
                {label} (%)
                <input
                  name={`w_${k}`}
                  inputMode="numeric"
                  defaultValue={weights?.[k] ?? ""}
                  className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text"
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">From your syllabus. Leave blank to count every point the same.</p>
          <SubmitButton className="self-end">Save weights</SubmitButton>
        </ActionForm>
      </details>
    </section>
  );
}
