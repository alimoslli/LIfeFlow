import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md px-6 text-center">
      <p className="font-display text-6xl font-medium text-accent">404</p>
      <h1 className="mt-2 text-lg font-medium">We couldn&apos;t find that page</h1>
      <p className="mt-1 text-sm text-muted">It may have been deleted, or it belongs to a different account.</p>
      <Link href="/" className="mt-5 inline-block text-sm font-medium text-accent hover:underline">
        Back to Home
      </Link>
    </div>
  );
}
