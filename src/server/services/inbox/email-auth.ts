/**
 * Was this email really sent by the address in From? We only accept mail the
 * receiving service saw pass SPF or DKIM for the sender's domain, so a forged
 * From header can't file things into someone's account.
 */
export function senderAuthenticated(headers: { Name: string; Value: string }[], from: string) {
  const domain = from.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  const get = (n: string) => headers.filter((h) => h.Name.toLowerCase() === n).map((h) => h.Value.toLowerCase());
  const spfPass = get("received-spf").some((v) => v.startsWith("pass") && (v.includes(domain) || !v.includes("domain of")));
  const dkimPass = get("authentication-results").some((v) =>
    new RegExp(`dkim=pass[^;]*header\\.(d|i)=@?([a-z0-9-]+\\.)*${domain.replace(/\./g, "\\.")}`).test(v),
  );
  const arcSpf = get("authentication-results").some((v) =>
    new RegExp(`spf=pass[^;]*smtp\\.mailfrom=[^;\\s]*@?([a-z0-9-]+\\.)*${domain.replace(/\./g, "\\.")}`).test(v),
  );
  return spfPass || dkimPass || arcSpf;
}
