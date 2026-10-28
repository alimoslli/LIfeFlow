import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_EFFECTIVE_DATE, legalDetails } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Use", description: "The terms for using LifeFlow." };

export default function TermsOfUse() {
  const l = legalDetails();
  const contact = l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : <>the contact address published in our Privacy Policy</>;
  return (
    <>
      <h1>Terms of Use</h1>
      <p>Effective {LEGAL_EFFECTIVE_DATE}</p>

      <p>
        These Terms of Use (&quot;Terms&quot;) are an agreement between you and {l.operator} (&quot;we&quot;, &quot;us&quot;), who operates LifeFlow. By
        creating an account or using LifeFlow, you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use
        LifeFlow.
      </p>

      <h2>1. Who can use LifeFlow</h2>
      <p>
        You must be at least 13 years old. If you are under the age of majority where you live, you may use LifeFlow only with the permission of a parent or
        guardian who agrees to these Terms. You must give accurate account information and keep it up to date.
      </p>

      <h2>2. Your account</h2>
      <p>
        You are responsible for keeping your password and any authenticator device and backup codes secure, and for activity under your account. Tell us
        promptly if you believe your account has been accessed without permission. We recommend turning on two-step sign-in.
      </p>

      <h2>3. What LifeFlow does</h2>
      <p>
        LifeFlow helps you organize your finances, school, work, schedule, health information and notes, and includes an AI assistant that can answer questions
        and act on your records when you ask. Some features depend on services you choose to connect, such as Google or Apple Health. We may add, change or
        remove features over time.
      </p>

      <h2>4. The AI assistant</h2>
      <ul>
        <li>
          The assistant uses artificial intelligence and <strong>can be wrong</strong>. Check important information, especially amounts, dates and anything you
          will rely on or send to someone else.
        </li>
        <li>
          The assistant changes your data only through defined actions and shows what it changed. It asks for your confirmation before deleting records and
          before sending anything outside LifeFlow, such as an email. You are responsible for reviewing and approving those actions.
        </li>
        <li>You may rename the assistant and choose its personality and voice. These settings change its style, not its safety rules.</li>
      </ul>

      <h2>5. Not professional advice</h2>
      <p>
        LifeFlow and its assistant provide general information and organization tools. They are{" "}
        <strong>not financial, investment, tax, legal, medical or mental health advice</strong>, and LifeFlow is not a medical device. LifeFlow does not move
        money or make trades. Talk to a qualified professional before making important financial or health decisions, and contact emergency services in an
        emergency.
      </p>

      <h2>6. Connected services</h2>
      <p>
        When you connect a third-party service, you authorize LifeFlow to access the information described when you connect it, and your use of that service
        remains subject to its own terms. We are not responsible for third-party services, their availability, or the accuracy of the data they provide. You can
        disconnect them at any time.
      </p>

      <h2>7. Your content</h2>
      <p>
        You own the information you put into LifeFlow and the information you connect. You give us permission to store, process and display it only as needed to
        provide LifeFlow to you, including sending relevant parts to our service providers as described in the Privacy Policy. This permission ends when you
        delete the content or your account, except for copies in backups that expire on their normal schedule.
      </p>

      <h2>8. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use LifeFlow for anything illegal, harmful or fraudulent, or to harass anyone.</li>
        <li>Access another person&apos;s account or data, or connect accounts that are not yours.</li>
        <li>Probe, scan or test LifeFlow&apos;s security without permission, or interfere with its operation, including by automated or excessive requests.</li>
        <li>Try to make the assistant produce harmful content or bypass its safety measures.</li>
        <li>Copy, resell or reverse engineer LifeFlow, except as the law allows.</li>
      </ul>

      <h2>9. Fees</h2>
      <p>
        LifeFlow is currently free to use. If we introduce paid plans, we will describe the price and terms before you are charged, and you will only be charged
        after you agree.
      </p>

      <h2>10. Ending your use</h2>
      <p>
        You can stop using LifeFlow and delete your account at any time from Settings. We may suspend or end your access if you seriously or repeatedly break
        these Terms, or if required by law, and we will tell you why unless we are not allowed to. Sections that by their nature should survive termination will
        survive.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        LifeFlow is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent allowed by law, we disclaim all warranties, express or
        implied, including warranties of merchantability, fitness for a particular purpose, accuracy and non-infringement. We do not promise that LifeFlow will
        be uninterrupted, error-free, or that information it shows, including information from connected services and the assistant, will be accurate or
        complete.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the fullest extent allowed by law, we will not be liable for any indirect, incidental, special, consequential or punitive damages, or for lost
        profits, data or opportunities, arising from your use of LifeFlow. Our total liability for any claim relating to LifeFlow is limited to the greater of
        the amount you paid us in the 12 months before the claim or US $50. Some places do not allow these limits, so they may not apply to you.
      </p>

      <h2>13. Indemnity</h2>
      <p>
        If you use LifeFlow in violation of these Terms or the law, you agree to cover reasonable losses and costs we incur from claims by others resulting from
        that use, to the extent allowed by law.
      </p>

      <h2>14. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of {l.jurisdiction}, without regard to conflict of law rules. Before filing a claim, you agree to contact us and
        try to resolve the dispute informally for 30 days. Either of us may bring a qualifying claim in small claims court. Otherwise, disputes will be resolved
        in the state or federal courts located in that state, and both parties consent to their jurisdiction. Nothing in these Terms limits rights you have
        under consumer protection laws that cannot be waived.
      </p>

      <h2>15. Changes to these Terms</h2>
      <p>
        We may update these Terms. We will change the effective date above, and if a change is material we will tell you in the app before it takes effect. If
        you keep using LifeFlow after changes take effect, you accept the updated Terms.
      </p>

      <h2>16. Contact</h2>
      <p>Questions about these Terms: {contact}.</p>
    </>
  );
}
