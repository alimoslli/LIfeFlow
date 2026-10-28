import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_EFFECTIVE_DATE, legalDetails } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy", description: "How LifeFlow collects, uses, protects and deletes your information." };

export default function PrivacyPolicy() {
  const l = legalDetails();
  const contact = l.email ? (
    <a href={`mailto:${l.email}`}>{l.email}</a>
  ) : (
    <>the contact address listed on this page once published, or by deleting your data directly in the app</>
  );
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Effective {LEGAL_EFFECTIVE_DATE}</p>

      <p>
        LifeFlow is a personal organizer for your money, school, work, schedule, health and notes, with a built-in AI assistant. LifeFlow is operated by{" "}
        {l.operator} (&quot;we&quot;, &quot;us&quot;). This policy explains what information we collect, why, who we share it with, how long we keep it, and the
        choices you have. We wrote it to match how the app actually works.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>We collect what you put into LifeFlow and what you choose to connect. We use it only to run LifeFlow for you.</li>
        <li>We do not sell your personal information, we do not use it for advertising, and we do not use it to train AI models.</li>
        <li>Your data is separated from every other account at the database level, and connection tokens are encrypted.</li>
        <li>You can export everything or delete your account and its data at any time from Settings.</li>
      </ul>

      <h2>1. Information we collect</h2>
      <h3>Information you give us</h3>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address, time zone, and a password, which we store only as a salted, one-way hash. If you turn on
          two-step sign-in, we store an encrypted authenticator secret and hashed backup codes.
        </li>
        <li>
          <strong>Your content:</strong> anything you add, such as accounts and balances, transactions, budgets, goals, bills, classes, assignments, work shifts
          and pay, calendar events, tasks, notes, files you attach, and settings such as your assistant&apos;s name, personality and voice.
        </li>
        <li>
          <strong>Conversations with your assistant:</strong> the messages you type or speak, the assistant&apos;s replies, and the actions it took for you.
          Voice is processed live and we keep a text transcript, not the audio recording.
        </li>
        <li>
          <strong>Memories:</strong> facts and preferences you ask the assistant to remember or approve from its suggestions. You can see, edit and delete each
          one in Settings.
        </li>
      </ul>

      <h3>Information from services you connect</h3>
      <p>Connections are optional and you can disconnect them at any time.</p>
      <ul>
        <li>
          <strong>Google (Gmail and Google Calendar):</strong> if you connect your Google account, we access the email messages, drafts and calendar events
          needed to answer your requests, for example to find an email, summarize your inbox, draft a reply you review, or show and add calendar events. We
          store your Google access tokens encrypted. We fetch email content when you ask for it and do not keep a copy of your mailbox. Calendar events you sync
          are stored so they appear in your plan.
        </li>
        <li>
          <strong>Apple Health:</strong> if you set up the LifeFlow shortcut on your iPhone, it sends the health measurements you choose (for example steps,
          sleep, active energy, heart rate and weight) to your LifeFlow account. Health data is sensitive, and we treat it that way: it is used only to show you
          your own health information and to answer your own questions about it.
        </li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Security and service records:</strong> sign-in times, the device&apos;s browser type, IP address used for rate limiting, and a log of
          sensitive account actions you can view in Settings.
        </li>
        <li>
          <strong>Assistant usage measurements:</strong> for each request, how long it took, how many steps and tools it used, whether it succeeded, and how
          much AI processing it used. These records do not contain what you said.
        </li>
        <li>
          <strong>Cookies:</strong> we use only essential cookies, to keep you signed in, to complete two-step sign-in, and to remember your light or dark
          theme. We do not use advertising or cross-site tracking cookies, and we do not use third-party analytics.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>To provide LifeFlow: showing your day, plans and finances, and letting your assistant read and update your records when you ask.</li>
        <li>To personalize your assistant with the memories and settings you approve.</li>
        <li>To keep your account secure, prevent abuse, and fix problems.</li>
        <li>To measure and improve the speed, reliability and cost of the assistant, using the usage measurements described above.</li>
        <li>To communicate with you about your account or important changes to LifeFlow.</li>
      </ul>
      <p>
        We do not sell or rent personal information, use it for targeted advertising, or use your content, health data or Google data to train artificial
        intelligence models. We only use your information in other ways with your consent.
      </p>

      <h2>3. The AI assistant</h2>
      <p>
        When you use the assistant, the parts of your information needed to answer your request (your message, relevant records, relevant approved memories,
        and, if you ask about them, your email, calendar or health data) are sent to our AI provider, OpenAI, to generate the response. OpenAI processes this
        under its API terms. Under those terms, OpenAI does not use data sent through its API to train its models by default, and it may retain data for a
        limited period to detect abuse. We send requests with OpenAI&apos;s response storage turned off, and your conversation history is stored in your
        LifeFlow account, not with OpenAI.
      </p>
      <p>
        The assistant only changes your data through defined actions, shows you what it changed, and asks for your confirmation before deleting things or
        sending anything outside LifeFlow, such as an email.
      </p>

      <h2>4. Google user data</h2>
      <p>
        LifeFlow&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Specifically, we use Google data only to provide the features you use in LifeFlow; we do not transfer it to
        others except as needed to provide those features (including to our AI provider to answer your request), to comply with law, or as part of a merger or
        acquisition with notice to you; we do not use it for advertising; and no person reads it unless you give us permission for a specific message, it is
        needed for security or legal reasons, or it is aggregated and anonymized for internal operations.
      </p>

      <h2>5. Who we share information with</h2>
      <p>We share information only with service providers that help us run LifeFlow, under contracts that limit their use of it, and only as needed:</p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vercel</td>
            <td>Hosting the app</td>
          </tr>
          <tr>
            <td>Neon</td>
            <td>Database hosting</td>
          </tr>
          <tr>
            <td>OpenAI</td>
            <td>Generating assistant responses, including live voice</td>
          </tr>
          <tr>
            <td>Google</td>
            <td>Gmail and Google Calendar, only if you connect them</td>
          </tr>
        </tbody>
      </table>
      <p>
        We may also disclose information if required by law or to protect the rights, safety and security of our users or the public, and in connection with a
        merger, acquisition or sale of assets, in which case this policy will continue to apply or you will be notified.
      </p>

      <h2>6. How we protect information</h2>
      <ul>
        <li>All traffic is encrypted in transit with HTTPS.</li>
        <li>Each account&apos;s records are isolated in the database, so one account cannot read another&apos;s data.</li>
        <li>Passwords are hashed, sign-in attempts are rate limited, and you can turn on two-step sign-in.</li>
        <li>Tokens for connected services and authenticator secrets are encrypted at rest.</li>
      </ul>
      <p>
        No method of storage or transmission is completely secure, but we work to protect your information and will notify you of a breach affecting it as
        required by law.
      </p>

      <h2>7. How long we keep information</h2>
      <p>
        We keep your information for as long as your account exists. When you delete your account, your data is deleted from our database right away; copies in
        our providers&apos; backups expire within their normal backup periods. Rate-limit records are deleted after about a day, and expired sign-in sessions
        are cleared automatically. Disconnecting Google removes your stored Google tokens.
      </p>

      <h2>8. Your choices and rights</h2>
      <ul>
        <li>
          <strong>Access and portability:</strong> download all your data from <Link href="/settings/data">Settings, Privacy &amp; data</Link>.
        </li>
        <li>
          <strong>Correction:</strong> edit your profile, records and memories in the app.
        </li>
        <li>
          <strong>Deletion:</strong> delete individual records, memories or conversations, or delete your whole account from Settings.
        </li>
        <li>
          <strong>Connections:</strong> disconnect Google or revoke the Apple Health shortcut at any time. You can also remove LifeFlow&apos;s access from your
          Google account settings.
        </li>
        <li>
          <strong>Assistant memory:</strong> turn memory suggestions off, and review or delete what the assistant remembers.
        </li>
      </ul>
      <p>
        Depending on where you live, you may have additional rights, such as the right to know what personal information we collect, to correct or delete it,
        and to not be discriminated against for exercising these rights. California residents: we do not sell or share personal information for cross-context
        behavioral advertising, and we use sensitive personal information (such as account credentials and health data) only to provide the service you request.
        To make a request we cannot handle through the app, contact us at {contact}. We will verify your request using your account.
      </p>

      <h2>9. Children</h2>
      <p>
        LifeFlow is not intended for children under 13, and we do not knowingly collect personal information from them. If you believe a child under 13 has
        created an account, contact us and we will delete it.
      </p>

      <h2>10. International users</h2>
      <p>LifeFlow is operated from the United States and your information is processed and stored in the United States.</p>

      <h2>11. Changes to this policy</h2>
      <p>
        If we change this policy, we will update the effective date above. If a change materially affects how we use your information, we will tell you in the
        app before it takes effect.
      </p>

      <h2>12. Contact</h2>
      <p>Questions or requests about privacy: {contact}.</p>
    </>
  );
}
