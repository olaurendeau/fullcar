"use client";

import { useEffect } from "react";
import { visit } from "@/app/actions";
import { sendVisit } from "@/app/session-token";

/**
 * The visit of each page load (OA9.6, OA9.7), mounted once by the root layout: the
 * browser's session token, if it keeps one, goes to the `visit` action, which slides the
 * session and notes the visit on the account. Without a token, nothing is sent. Renders
 * nothing: the page never depends on the session (architecture, « Session, liens et jeton
 * d'admin »).
 */
export function SessionVisit() {
  useEffect(() => {
    void sendVisit(visit);
  }, []);
  return null;
}
