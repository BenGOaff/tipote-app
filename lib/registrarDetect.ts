// lib/registrarDetect.ts
//
// Maps the authoritative nameservers of a hostname to a known DNS
// provider, so the Settings UI can show the right step-by-step
// instructions (Cloudflare, OVH, GoDaddy, …) instead of a generic
// "ask your registrar where to add a CNAME record" blurb.
//
// Pure module — no Node deps, safe for the Edge runtime if we ever
// need it there. The actual NS lookup happens in
// lib/customDomainsServer.ts and feeds its result into detectRegistrar().

export type RegistrarId =
  | "cloudflare"
  | "ovh"
  | "godaddy"
  | "namecheap"
  | "gandi"
  | "google"
  | "route53"
  | "ionos"
  | "hetzner"
  | "scaleway"
  | "porkbun"
  | "hostinger"
  | "unknown";

export type RegistrarInfo = {
  id: RegistrarId;
  label: string;
  // Public-facing URL where the user manages DNS records, when there is
  // a canonical entry point. Used to build a "Open your DNS dashboard"
  // CTA in the UI.
  dnsConsoleUrl: string | null;
};

// Order matters: we match against the first pattern that hits. Patterns
// are tested case-insensitively as a suffix of each nameserver. Keeping
// them as plain endsWith() checks rather than regexes avoids surprises
// with anchored matches.
const PATTERNS: ReadonlyArray<{ id: RegistrarId; suffixes: ReadonlyArray<string> }> = [
  { id: "cloudflare", suffixes: ["ns.cloudflare.com"] },
  { id: "ovh", suffixes: ["ovh.net", "ovh.com", "ovh.ca"] },
  { id: "godaddy", suffixes: ["domaincontrol.com"] },
  { id: "namecheap", suffixes: [
    "registrar-servers.com",
    "namecheaphosting.com",
  ] },
  { id: "gandi", suffixes: ["gandi.net"] },
  { id: "google", suffixes: ["googledomains.com", "domains.google"] },
  { id: "route53", suffixes: [
    "awsdns-00.com", "awsdns-00.net", "awsdns-00.org", "awsdns-00.co.uk",
  ] },
  { id: "ionos", suffixes: ["ui-dns.com", "ui-dns.de", "ui-dns.org", "ui-dns.biz"] },
  { id: "hetzner", suffixes: ["hetzner.com", "your-server.de", "ns-cloud-d1.googledomains.com"] },
  { id: "scaleway", suffixes: ["scaleway.com", "online.net"] },
  { id: "porkbun", suffixes: ["porkbun.com"] },
  { id: "hostinger", suffixes: ["dns-parking.com", "hostinger.com"] },
];

const LABELS: Record<RegistrarId, string> = {
  cloudflare: "Cloudflare",
  ovh: "OVHcloud",
  godaddy: "GoDaddy",
  namecheap: "Namecheap",
  gandi: "Gandi",
  google: "Google Domains / Squarespace",
  route53: "Amazon Route 53",
  ionos: "IONOS",
  hetzner: "Hetzner",
  scaleway: "Scaleway",
  porkbun: "Porkbun",
  hostinger: "Hostinger",
  unknown: "Your DNS provider",
};

// Canonical entry points where the user manages DNS records. Some
// registrars (Route 53, internal IT registrars) need a logged-in
// console URL that varies per account, so we leave those as null.
const CONSOLE_URLS: Record<RegistrarId, string | null> = {
  cloudflare: "https://dash.cloudflare.com",
  ovh: "https://www.ovh.com/manager/#/web/domain",
  godaddy: "https://dcc.godaddy.com/manage/dns",
  namecheap: "https://ap.www.namecheap.com/Domains/DomainControlPanel",
  gandi: "https://admin.gandi.net/domain",
  google: "https://domains.google.com",
  route53: "https://console.aws.amazon.com/route53/v2/hostedzones",
  ionos: "https://www.ionos.com/help/domains/",
  hetzner: "https://accounts.hetzner.com",
  scaleway: "https://console.scaleway.com/domains/",
  porkbun: "https://porkbun.com/account/domain",
  hostinger: "https://hpanel.hostinger.com/domains",
  unknown: null,
};

export function detectRegistrar(nameservers: readonly string[]): RegistrarInfo {
  // Normalise to lowercase and strip trailing dot from FQDNs.
  const normalised = nameservers
    .map((n) => n.toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);

  for (const { id, suffixes } of PATTERNS) {
    if (normalised.some((ns) => suffixes.some((s) => ns.endsWith(s)))) {
      return { id, label: LABELS[id], dnsConsoleUrl: CONSOLE_URLS[id] };
    }
  }
  return { id: "unknown", label: LABELS.unknown, dnsConsoleUrl: null };
}
