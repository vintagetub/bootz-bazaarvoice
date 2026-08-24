"use client";

import { useEffect, useState } from "react";
import type { MpsCloseData } from "@/types/bazaarvoice";

/** Query flag that reveals the panel. Never shown to ordinary consumers. */
export const DEBUG_FLAG = "bvDebug";

/** Which Bazaarvoice app the host page is rendering. */
export type BvApp = "multi_submission" | "product_picker";

interface Snapshot {
  paramNames: string[];
  rawQuery: string;
  bvGlobal: string;
  callbackDefined: string;
  containerFound: string;
  containerPopulated: string;
  /** MPS only. */
  userParam: string;
  productsParam: string;
  lastCloseEvent: string;
  /** Product Picker only — read back off the DOM, not the server config. */
  pickerAttributes: string;
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
  return `${value.split(",").filter(Boolean).length} product id(s)`;
}

/**
 * Shows the query string as it actually arrived, so percent-encoding
 * introduced upstream is visible — `products=A%2CB%2CC` instead of
 * `products=A,B,C` is otherwise a silent failure. The `user` value is redacted
 * because it carries consumer PII; everything else is left byte-for-byte.
 */
function redactRawQuery(search: string): string {
  if (!search) return "(none)";
  return search.replace(
    /([?&]user=)([^&]*)/gi,
    (_match, prefix: string, value: string) => `${prefix}[${value.length} chars redacted]`,
  );
}

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
 * Read-only integration check for the staging test step in Bazaarvoice's
 * implementation checklist. Renders only when `?bvDebug=1` is in the URL.
 *
 * Everything is read on the client so the host pages stay statically
 * rendered — a static page is materially more available than a per-request
 * render, and Bazaarvoice does not fail over to their hosted page if ours is
 * down.
 */
export function BvDiagnostics({ app, loaderUrl }: { app: BvApp; loaderUrl: string | null }) {
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
      const container = document.querySelector(`[data-bv-show="${app}"]`);
      setSnapshot({
        paramNames: [...params.keys()].filter((name) => name !== DEBUG_FLAG),
        rawQuery: redactRawQuery(window.location.search),
        userParam: describeToken(params.get("user")),
        productsParam: describeProducts(params.get("products")),
        bvGlobal: window.BV ? "window.BV is present" : "window.BV not set yet",
        callbackDefined: typeof window.bvCallback === "function" ? "yes" : "no",
        pickerAttributes: describePickerAttributes(container),
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
  }, [app]);

  if (!snapshot) return null;

  const rows: [string, string][] = [
    ["Bazaarvoice app", app],
    ["bv.js URL", loaderUrl ?? "NOT CONFIGURED"],
    ["window.bvCallback", snapshot.callbackDefined],
    ["Bazaarvoice global", snapshot.bvGlobal],
    ["Container div", snapshot.containerFound],
    ["Container content", snapshot.containerPopulated],
    ...(app === "product_picker"
      ? ([["Picker attributes", snapshot.pickerAttributes]] as [string, string][])
      : ([
          ["user param", snapshot.userParam],
          ["products param", snapshot.productsParam],
          ["Last mpsClose", snapshot.lastCloseEvent],
        ] as [string, string][])),
    ["Other params", snapshot.paramNames.join(", ") || "none"],
    ["Raw query string", snapshot.rawQuery],
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
        Visible because <code>?{DEBUG_FLAG}=1</code> is in the URL. Remove it to see the consumer
        view.
      </p>
    </section>
  );
}
