// Required for the @modal parallel route slot: whenever the current URL
// doesn't match anything inside @modal (i.e. every /admin/* route except
// an intercepted /admin/tenants/[id] navigation), this renders instead —
// nothing.
export default function Default() {
  return null;
}
