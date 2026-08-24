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
  forceVisible = false,
}: {
  loaderUrl: string | null;
  /** Set on the debug route, where the panel is the point of the page. */
  forceVisible?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

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
          <LogBlock
            title="Bazaarvoice network calls"
            empty="None recorded. If this stays empty, bv.js never asked Bazaarvoice for products — the picker is failing before it fetches."
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
