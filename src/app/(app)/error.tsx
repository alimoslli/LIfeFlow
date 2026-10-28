"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
      <h1 className="mt-3 font-display text-2xl font-medium">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        This page couldn&apos;t load. Your data is safe — try again, and if it keeps happening, check the server logs
        {error.digest ? ` (ref ${error.digest})` : ""}.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
