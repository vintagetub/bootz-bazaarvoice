"use client";

import { useEffect, useState } from "react";

/** Query flag that reveals the panel. Never shown to ordinary consumers. */
export const DEBUG_FLAG = "bvDebug";

const CONTAINER_SELECTOR = '[data-bv-show="product_picker"]';

interface Snapshot {
  bvGlobal: string;
  containerFound: string;
  containerPopulated: string;
  pickerAttributes: string;
  /** Populated only on the debug route, where BvErrorCapture is installed. */
  consoleLog: string[];
  network: string[];
  /** Every Bazaarvoice request the browser actually made, by any mechanism. */
  resources: string[];
}

interface DomainCheck {
  status: "allowed" | "blocked" | "unavailable";
  hostname: string;
  allowlist: string[];
  detail: string;
}

/**
 * Reads the `domains` allowlist out of the deployment config and compares it to
 * the page's hostname.
 *
 * bv.js checks the hostname against this list and aborts if it is absent. That
 * failure is indistinguishable from every other cause of an empty container, so
 * it is worth checking explicitly rather than inferring.
 */
async function checkDomain(configUrl: string): Promise<DomainCheck> {
  const hostname = window.location.hostname;
  const base: DomainCheck = { status: "unavailable", hostname, allowlist: [], detail: "" };

  let text: string;
  try {
    const response = await fetch(configUrl);
    if (!response.ok) {
      return { ...base, detail: `Config returned HTTP ${response.status}.` };
    }
    text = await response.text();
  } catch (error) {
    return {
      ...base,
      detail: `Could not read the config (${error instanceof Error ? error.message : "failed"}). Check it by hand: ${configUrl}`,
    };
  }

  // Deliberately a regex rather than executing the file: it is a script that
  // calls BV[...].configure(...), and running it would need bv.js present.
  const entries = [...text.matchAll(/"domainAddress":"([^"]+)"/g)].map((match) => match[1] ?? "");
  const subdomainFlags = [...text.matchAll(/"allowSubdomain":(true|false)/g)].map(
    (match) => match[1] === "true",
  );

  if (entries.length === 0) {
    return { ...base, detail: "No domains block found in the config." };
  }

  const allowlist = entries.map((domain, index) =>
    subdomainFlags[index] ? `${domain} (+subdomains)` : domain,
  );

  const allowed = entries.some((domain, index) =>
    subdomainFlags[index]
      ? hostname === domain || hostname.endsWith(`.${domain}`)
      : hostname === domain,
  );

  return {
    status: allowed ? "allowed" : "blocked",
    hostname,
    allowlist,
    detail: allowed
      ? "This hostname is allowlisted."
      : "This hostname is NOT allowlisted. bv.js aborts on an unrecognised host, which stops it loading anything — serve the page from a listed domain, or have Bazaarvoice add this one.",
  };
}

/**
 * Reads the browser's own Resource Timing buffer.
 *
 * This is the authoritative view of what bv.js fetched. Wrapping `fetch` and
 * `XMLHttpRequest` misses script tags, images, and beacons — and bv.js is a
 * loader whose whole job is injecting further scripts — so an empty
 * fetch/XHR list must not be read as "no network activity".
 */
function readResourceTimings(): string[] {
  try {
    if (typeof performance?.getEntriesByType !== "function") return [];
    return performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("bazaarvoice.com"))
      .map((entry) => {
        const timing = entry as PerformanceResourceTiming & { responseStatus?: number };
        const status = timing.responseStatus ? ` → ${timing.responseStatus}` : "";
        // transferSize 0 with a nonzero duration usually means a cache hit or an
        // opaque cross-origin response, so it is reported rather than judged.
        const size = timing.transferSize ? ` ${timing.transferSize}B` : "";
        return `${timing.initiatorType || "?"}${status}${size}  ${entry.name.slice(0, 240)}`;
      });
  } catch {
    return [];
  }
}

/** Reads the data-bv-* attributes back off the DOM, not the server config. */
function describePickerAttributes(container: Element | null): string {
  if (!container) return "n/a";
  const names = [
    "data-bv-campaign-id",
    "data-bv-category-id",
    "data-bv-family-product-id",
    "data-bv-inline",
    "data-bv-prevent-close",
  ];
  const present = names
    .filter((name) => container.hasAttribute(name))
    .map((name) => `${name.replace("data-bv-", "")}=${container.getAttribute(name)}`);
  return present.join("  ") || "none set";
}

function readContainer(
  container: Element | null,
): Pick<Snapshot, "containerFound" | "containerPopulated"> {
  if (!container) {
    return { containerFound: "NOT FOUND — nothing can render", containerPopulated: "n/a" };
  }
  return {
    containerFound: "found",
    containerPopulated:
      container.childElementCount > 0
        ? `yes (${container.childElementCount} child node(s))`
        : "empty — Bazaarvoice has not rendered into it",
  };
}

/**
 * Read-only integration check, shown only when `?bvDebug=1` is in the URL.
 *
 * Its whole job is to separate two states that look identical from a blank
 * page: our markup being wrong, and Bazaarvoice declining to render into
 * correct markup. `window.BV is present` plus a found-but-empty container means
 * the integration is complete and the cause is account-side — Product Picker
 * not enabled, or no products mapped to the category.
 *
 * Everything is read on the client so the host pages stay statically rendered.
 */
export function BvDiagnostics({
  loaderUrl,
  configUrl = null,
  forceVisible = false,
}: {
  loaderUrl: string | null;
  /** Deployment config URL, for the domain-allowlist check. */
  configUrl?: string | null;
  /** Set on the debug route, where the panel is the point of the page. */
  forceVisible?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [domain, setDomain] = useState<DomainCheck | null>(null);

  useEffect(() => {
    if (!forceVisible || !configUrl) return;
    // No synchronous placeholder state: the block simply does not render until
    // the check resolves, which keeps this effect a pure subscription.
    let cancelled = false;
    checkDomain(configUrl).then((result) => {
      if (!cancelled) setDomain(result);
    });
    return () => {
      cancelled = true;
    };
  }, [configUrl, forceVisible]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flagged = ["1", "true", "yes"].includes((params.get(DEBUG_FLAG) ?? "").toLowerCase());
    if (!flagged && !forceVisible) return;

    const sample = () => {
      const container = document.querySelector(CONTAINER_SELECTOR);
      setSnapshot({
        bvGlobal: window.BV ? "window.BV is present" : "window.BV not set yet",
        pickerAttributes: describePickerAttributes(container),
        consoleLog: [...(window.__bvLog ?? [])],
        network: [...(window.__bvNet ?? [])],
        resources: readResourceTimings(),
        ...readContainer(container),
      });
    };

    // bv.js is async and renders on its own schedule, so keep sampling briefly
    // rather than reporting a single misleading snapshot. The first sample is
    // deferred rather than run inline so this effect stays a pure subscription.
    const first = window.setTimeout(sample, 0);
    const interval = window.setInterval(sample, 1000);
    const stop = window.setTimeout(() => window.clearInterval(interval), 20_000);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [forceVisible]);

  if (!snapshot) return null;

  const rows: [string, string][] = [
    ["Bazaarvoice app", "product_picker"],
    ["bv.js URL", loaderUrl ?? "NOT CONFIGURED"],
    ["Bazaarvoice global", snapshot.bvGlobal],
    ["Container div", snapshot.containerFound],
    ["Container content", snapshot.containerPopulated],
    ["Picker attributes", snapshot.pickerAttributes],
  ];

  return (
    <section className="diagnostics" aria-label="Bazaarvoice integration diagnostics">
      <h2 className="diagnostics__title">Bazaarvoice diagnostics</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {forceVisible ? (
        <>
          {domain ? (
            <div className="diagnostics__log">
              <h3 className="diagnostics__title">Domain allowlist</h3>
              <dl>
                <div style={{ display: "contents" }}>
                  <dt>This hostname</dt>
                  <dd>{domain.hostname}</dd>
                </div>
                <div style={{ display: "contents" }}>
                  <dt>Verdict</dt>
                  <dd>
                    {domain.status === "allowed"
                      ? "ALLOWED"
                      : domain.status === "blocked"
                        ? "NOT ALLOWLISTED"
                        : "could not determine"}
                  </dd>
                </div>
              </dl>
              {domain.allowlist.length > 0 ? (
                <ol className="diagnostics__loglist">
                  {domain.allowlist.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ol>
              ) : null}
              {domain.detail ? <p className="diagnostics__hint">{domain.detail}</p> : null}
            </div>
          ) : null}
          <LogBlock
            title="All Bazaarvoice requests (Resource Timing — authoritative)"
            empty="Nothing at all, not even bv.js. Something is blocking the request entirely."
            lines={snapshot.resources}
          />
          <LogBlock
            title="fetch / XHR calls only"
            empty="None — but this does NOT mean no network activity. Script tags, images and beacons use neither, and bv.js is a loader that injects scripts. Read the Resource Timing list above instead."
            lines={snapshot.network}
          />
          <LogBlock
            title="Console errors and warnings"
            empty="None recorded."
            lines={snapshot.consoleLog}
          />
        </>
      ) : (
        <p className="diagnostics__hint">
          Visible because <code>?{DEBUG_FLAG}=1</code> is in the URL. Remove it to see the consumer
          view.
        </p>
      )}
    </section>
  );
}

function LogBlock({
  title,
  empty,
  lines,
}: {
  title: string;
  empty: string;
  lines: string[];
}) {
  return (
    <div className="diagnostics__log">
      <h3 className="diagnostics__title">{title}</h3>
      {lines.length === 0 ? (
        <p className="diagnostics__hint">{empty}</p>
      ) : (
        <ol className="diagnostics__loglist">
          {lines.map((line, index) => (
            <li key={`${index}-${line.slice(0, 40)}`}>{line}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
