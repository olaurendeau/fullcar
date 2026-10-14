"use client";

import { AdminLinkProblem, AdminPanel } from "@/components/event/admin-panel";
import { useAdminLinkCheck } from "./admin-link";

/**
 * Above the event: the organiser's panel once the server has accepted the link's token
 * (C4.9), the "not valid" message otherwise (C6.5). Nothing while the check runs.
 */
export function AdminArrival({ id }: { id: string }) {
  const check = useAdminLinkCheck(id);
  if (check.state === "valid") return <AdminPanel publicUrl={check.publicUrl} adminUrl={check.adminUrl} />;
  if (check.state === "checking") return null;
  return <AdminLinkProblem problem={check.state} />;
}
