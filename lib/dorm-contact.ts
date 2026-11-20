// The dorm's public contact details (dormitories.address / contact_number /
// email / operating_hours): what a tenant sees on their home page and what is
// printed on invoices and receipts. Pure, so the same rules can be tested and
// used by the Settings API.

export type DormContact = {
  address: string | null;
  contact_number: string | null;
  email: string | null;
  operating_hours: string | null;
};

export const CONTACT_LIMITS = {
  address: 200,
  contactNumber: 40,
  email: 254,
  operatingHours: 120,
} as const;

// Deliberately simple: one @, something either side, a dot in the domain, no
// spaces. Real validation is the mail server accepting it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Digits, spaces and the punctuation people write phone numbers with.
const PHONE = /^[+()\d][\d\s()+\-./,]*$/;

type Input = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

// Empty means "not set": stored as null so nothing blank is ever shown.
export function parseDormContact(
  input: Input
): { ok: true; value: DormContact } | { ok: false; error: string } {
  const address = text(input.address);
  const contactNumber = text(input.contactNumber);
  const email = text(input.contactEmail).toLowerCase();
  const operatingHours = text(input.operatingHours);

  if (address.length > CONTACT_LIMITS.address) {
    return { ok: false, error: `Address must be ${CONTACT_LIMITS.address} characters or fewer.` };
  }
  if (contactNumber.length > CONTACT_LIMITS.contactNumber) {
    return { ok: false, error: `Contact number must be ${CONTACT_LIMITS.contactNumber} characters or fewer.` };
  }
  if (contactNumber && !PHONE.test(contactNumber)) {
    return { ok: false, error: "Contact number can only contain digits, spaces and + ( ) - . characters." };
  }
  if (email.length > CONTACT_LIMITS.email) {
    return { ok: false, error: "Contact email is too long." };
  }
  if (email && !EMAIL.test(email)) {
    return { ok: false, error: "Enter a valid contact email, or leave it empty." };
  }
  if (operatingHours.length > CONTACT_LIMITS.operatingHours) {
    return { ok: false, error: `Office hours must be ${CONTACT_LIMITS.operatingHours} characters or fewer.` };
  }

  return {
    ok: true,
    value: {
      address: address || null,
      contact_number: contactNumber || null,
      email: email || null,
      operating_hours: operatingHours || null,
    },
  };
}

export function hasDormContact(dorm: Partial<DormContact> | null | undefined) {
  return Boolean(
    dorm && (dorm.address || dorm.contact_number || dorm.email || dorm.operating_hours)
  );
}

// A value safe to put in a tel: link: keep only dialable characters.
export function telHref(number: string) {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}
