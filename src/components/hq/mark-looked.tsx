"use client";
import { useEffect } from "react";

/** After the page has shown "Since you last looked", remember now as the time the owner last looked. The server reads it next time. */
export function MarkLooked({ name }: { name: string }) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${Date.now()}; Path=/admin; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  }, [name]);
  return null;
}
