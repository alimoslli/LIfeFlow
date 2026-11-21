import { permanentRedirect } from "next/navigation";

/**
 * About is part of the front page now (owner, 2026-11-21: "I want it all on one page"; docs/backlog/2026-11-21-one-page-website.md).
 * Old links land on its section there. Signed-in visitors reach "/" as the app, as before.
 */
export default function AboutPage() {
  permanentRedirect("/#about");
}
