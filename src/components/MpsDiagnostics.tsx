"use client";

import { useEffect, useState } from "react";
import type { MpsCloseData } from "@/types/bazaarvoice";

/** Query flag that reveals this panel. Never shown to ordinary consumers. */
export const DEBUG_FLAG = "bvDebug";

interface Snapshot {
  paramNames: string[];
  userParam: string;
  productsParam: string;
  bvGlobal: string;
  callbackDefined: string;
  containerFound: string;
  containerPopulated: string;
  lastCloseEvent: string;
}

/** Shows a token is present without printing it — `user` carries consumer PII. */
function describeToken(value: string | null): string {
  if (value === null) return "missing";
  if (value === "") return "present but empty";
  return `present (${value.length} chars, starts "${value.slice(0, 8)}…")`;
}

function describeProducts(value: string | null): string {
  if (value === null) return "missing";
  if (value === "") return "present but empty";
  const ids = value.split(",").filter(Boolean);
  return `${ids.length} product id(s)`;
}

function readContainer(
  container: Element | null,
): Pick<Snapshot, "containerFound" | "containerPopulated"> {
  if (!container) {
    return { containerFound: "NOT FOUND — the form cannot render", containerPopulated: "n/a" };
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
 * Read-only integration check for the staging test step in Bazaarvoice's
 * implementation checklist. Renders only when `?bvDebug=1` is in the URL.
 *
 * Everything is read on the client so the page itself stays statically
 * rendered — a static page is materially more available than a per-request
 * render, and Bazaarvoice does not fail over to their hosted page if ours is
 * down.
 */
export function MpsDiagnostics({ loaderUrl }: { loaderUrl: string | null }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!["1", "true", "yes"].includes((params.get(DEBUG_FLAG) ?? "").toLowerCase())) return;

    let lastCloseEvent = "none yet";
    const onClose = (event: CustomEvent<MpsCloseData>) => {
      const detail = event.detail ?? {};
      lastCloseEvent = `completed=${String(detail.completed)} productsSubmitted=${String(detail.productsSubmitted)}`;
    };
    window.addEventListener("bootz:mpsClose", onClose);

    const sample = () => {
      const container = document.querySelector('[data-bv-show="multi_submission"]');
      setSnapshot({
        paramNames: [...params.keys()].filter((name) => name !== DEBUG_FLAG),
        userParam: describeToken(params.get("user")),
        productsParam: describeProducts(params.get("products")),
        bvGlobal: window.BV ? "window.BV is present" : "window.BV not set yet",
        callbackDefined: typeof window.bvCallback === "function" ? "yes" : "no",
        lastCloseEvent,
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
      window.removeEventListener("bootz:mpsClose", onClose);
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, []);

  if (!snapshot) return null;

  const rows: [string, string][] = [
    ["bv.js URL", loaderUrl ?? "NOT CONFIGURED"],
    ["window.bvCallback", snapshot.callbackDefined],
    ["Bazaarvoice global", snapshot.bvGlobal],
    ["Container div", snapshot.containerFound],
    ["Container content", snapshot.containerPopulated],
    ["user param", snapshot.userParam],
    ["products param", snapshot.productsParam],
    ["Other params", snapshot.paramNames.join(", ") || "none"],
    ["Last mpsClose", snapshot.lastCloseEvent],
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
      <p className="diagnostics__hint">
        Visible because <code>?{DEBUG_FLAG}=1</code> is in the URL. Remove it to see the consumer view.
      </p>
    </section>
  );
}
