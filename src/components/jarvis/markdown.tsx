import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isAppPath, isChatPage, linkAppPaths } from "@/lib/app-routes";

/** Renders model output as Markdown. Raw HTML is not rendered (react-markdown default). */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-bf text-[0.9062rem] text-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const internal = !!href && isAppPath(href);
            if (href && internal)
              return (
                <Link href={href} prefetch={isChatPage(href) ? false : undefined}>
                  {children}
                </Link>
              );
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            );
          },
        }}
      >
        {linkAppPaths(text)}
      </ReactMarkdown>
    </div>
  );
}
