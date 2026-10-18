"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { TabsContent } from "@/components/ui/tabs";
import type { Leg } from "@/domain/leg";

const noSubscription = () => () => {};

/**
 * A leg's panel, always in the HTML. Once hydrated, the tab panel of its tab. Until then,
 * and without JavaScript, where the tabs are hidden and the legs show one under the other,
 * a region named by its leg's heading: not a tab panel without tabs, nor named by a hidden
 * tab whose count it would read too.
 */
export function LegTabPanel({
  leg,
  headingId,
  className,
  children,
}: {
  leg: Leg;
  headingId: string;
  className: string;
  children: ReactNode;
}) {
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  // Left out once hydrated, rather than undefined: Radix's own role and name apply then.
  const region = hydrated ? {} : { role: "region", "aria-labelledby": headingId };

  return (
    <TabsContent value={leg} forceMount className={className} {...region}>
      {children}
    </TabsContent>
  );
}
