import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Academic integrity",
  description: "How LifeFlow's assistant helps students learn without doing their graded work.",
};

/** Plain-language promise for students, parents and schools. Matches the rules in Jarvis's instructions (ADR 0016). */
export default function IntegrityPage() {
  return (
    <>
      <h1>Academic integrity</h1>
      <p>
        LifeFlow helps students stay on top of school, work and money. Its assistant is a coach, not a ghostwriter. These rules are always on, in every class,
        and students can&apos;t turn them off.
      </p>

      <h2>What the assistant does</h2>
      <ul>
        <li>Tracks every assignment, exam and due date, and reminds you before it&apos;s late.</li>
        <li>Breaks big assignments into steps and puts study time into your real free time.</li>
        <li>Explains concepts using different examples than your assignment, and quizzes you to study.</li>
        <li>Finds sources with links and shows how to cite them.</li>
        <li>Builds an outline from your own ideas and gives feedback on your own draft, as comments.</li>
      </ul>

      <h2>What it won&apos;t do</h2>
      <ul>
        <li>Write essays, answers, code, lab reports or discussion posts for you to hand in.</li>
        <li>Solve or check answers to homework, quiz or exam questions.</li>
        <li>Rewrite or paraphrase text to get past plagiarism or AI detection.</li>
        <li>Help during an exam or quiz.</li>
      </ul>

      <h2>How it&apos;s enforced</h2>
      <p>
        The rules are part of the assistant&apos;s fixed instructions, which are the same for every student. When a request looks like graded work, the
        assistant switches to coach mode for that request: it says so in one sentence and offers real help instead. Every update to LifeFlow is checked against
        a test set of honest requests and attempts to get work done, and it must pass before it ships. LifeFlow never trains AI models on student data.
      </p>

      <p>
        Questions from a school or instructor? See our <Link href="/privacy">Privacy Policy</Link> for how student data is handled.
      </p>
    </>
  );
}
