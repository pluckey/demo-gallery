// Every demo in the gallery. Add one here and it appears in the sidebar and on the home page.
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { FileWarning, MessageSquareWarning, PenLine, type LucideIcon } from "lucide-react";

export type Demo = {
  path: string;
  title: string;
  blurb: string;
  category: string;
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType>;
};

export const categories: { name: string; blurb: string }[] = [
  { name: "Jev", blurb: "TypeSafe's decision model: typed answers with how sure it is, in about 0.2 seconds." },
];

export const demos: Demo[] = [
  {
    path: "/jev/scam", title: "Scam check", category: "Jev", icon: MessageSquareWarning,
    blurb: "Is this text a scam? Jev asks itself a few small questions to decide.",
    component: lazy(() => import("./jev/scam/ScamDemo")),
  },
  {
    path: "/jev/claims", title: "Claim triage", category: "Jev", icon: FileWarning,
    blurb: "An insurance claim walks a decision tree to the desk that should handle it.",
    component: lazy(() => import("./jev/claims/ClaimsDemo")),
  },
  {
    path: "/jev/coach", title: "Writing coach", category: "Jev", icon: PenLine,
    blurb: "A checklist that fills in while someone writes an incident report.",
    component: lazy(() => import("./jev/coach/CoachDemo")),
  },
];
