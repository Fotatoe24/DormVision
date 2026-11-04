// Which bills the room billing pop-up (components/room-billing-modal.tsx) shows
// for one tenant or one room.
//
// The pop-up is a working screen -- "mark as paid", "record payment", "delete" --
// not an archive, so it shows a short, recent list. The rule it used to apply was
// "the newest N bills", which had a flaw: an UNPAID bill older than those N was
// hidden while still being counted in the room's "₱X due". The owner could see
// money was owed but could not open the bill to collect it.
//
// The rule now: every unpaid bill is always shown, and the remaining room up to
// `cap` is filled with the most recent paid ones. Full history lives on the
// tenant's own (paginated) page.
export function pickVisibleBills<
  T extends { id: string; status: string; due_date: string },
>(bills: T[], cap: number): T[] {
  const newestFirst = [...bills].sort(
    (a, b) => b.due_date.localeCompare(a.due_date) || a.id.localeCompare(b.id)
  );

  const unpaidCount = newestFirst.filter((b) => b.status !== "paid").length;
  let paidRoom = Math.max(0, cap - unpaidCount);

  return newestFirst.filter((b) => {
    if (b.status !== "paid") return true;
    if (paidRoom <= 0) return false;
    paidRoom--;
    return true;
  });
}
