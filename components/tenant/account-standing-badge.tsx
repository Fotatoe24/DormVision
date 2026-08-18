import { CheckCircle2, Clock, AlertCircle, AlertTriangle } from "lucide-react";
import type { AccountStanding } from "@/lib/billing";

const config: Record<
  AccountStanding["status"],
  {
    label: string;
    description: string;
    icon: typeof CheckCircle2;
    dotClass: string;
    textClass: string;
  }
> = {
  current: {
    label: "Current",
    description: "Your account is up to date.",
    icon: CheckCircle2,
    dotClass: "bg-status-paid",
    textClass: "text-status-paid",
  },
  pending: {
    label: "Payment upcoming",
    description: "You have an upcoming payment due.",
    icon: Clock,
    dotClass: "bg-status-unpaid",
    textClass: "text-status-unpaid",
  },
  partial: {
    label: "Partially paid",
    description: "You've made a partial payment on your balance.",
    icon: AlertCircle,
    dotClass: "bg-status-partial",
    textClass: "text-status-partial",
  },
  overdue: {
    label: "Overdue",
    description: "Your payment is past due.",
    icon: AlertTriangle,
    dotClass: "bg-status-overdue",
    textClass: "text-status-overdue",
  },
};

// Status is always paired with an icon + label text, never color alone,
// so it reads correctly for colorblind users and screen readers.
export function AccountStandingBadge({
  status,
}: {
  status: AccountStanding["status"];
}) {
  const c = config[status];
  const Icon = c.icon;

  return (
    <div>
      <div className={`mb-1.5 flex items-center gap-2 ${c.textClass}`}>
        <span className={`h-2 w-2 rounded-full ${c.dotClass}`} aria-hidden="true" />
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-semibold">{c.label}</span>
      </div>
      <p className="text-xs text-foreground-muted">{c.description}</p>
    </div>
  );
}
