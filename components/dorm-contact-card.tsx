import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { hasDormContact, telHref, type DormContact } from "@/lib/dorm-contact";

// "How do I reach my dorm?" -- on the tenant home page. Renders nothing until
// the owner has filled in at least one detail in Settings, so a dorm that hasn't
// set it up never shows an empty box.
export function DormContactCard({
  dorm,
}: {
  dorm: (Partial<DormContact> & { name?: string | null }) | null;
}) {
  if (!dorm || !hasDormContact(dorm)) return null;

  const rowClass = "flex items-start gap-2.5 text-sm";
  const iconClass = "mt-0.5 h-4 w-4 shrink-0 text-foreground-muted";
  const linkClass =
    "text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <section className="mt-5 rounded-lg border border-border bg-surface p-6">
      <p className="mb-3 font-heading text-sm font-semibold">
        Contact {dorm.name ?? "your dorm"}
      </p>

      <div className="space-y-2.5">
        {dorm.address && (
          <p className={rowClass}>
            <MapPin aria-hidden className={iconClass} />
            <span>{dorm.address}</span>
          </p>
        )}

        {dorm.contact_number && (
          <p className={rowClass}>
            <Phone aria-hidden className={iconClass} />
            <a href={telHref(dorm.contact_number)} className={linkClass}>
              {dorm.contact_number}
            </a>
          </p>
        )}

        {dorm.email && (
          <p className={rowClass}>
            <Mail aria-hidden className={iconClass} />
            <a href={`mailto:${dorm.email}`} className={`${linkClass} break-all`}>
              {dorm.email}
            </a>
          </p>
        )}

        {dorm.operating_hours && (
          <p className={rowClass}>
            <Clock aria-hidden className={iconClass} />
            <span>
              <span className="text-foreground-muted">Office hours: </span>
              {dorm.operating_hours}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
