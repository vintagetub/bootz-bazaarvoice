import { getBvConfig, getMpsBehaviour, getPickerConfig } from "@/lib/config";

/**
 * Uptime probe.
 *
 * Bazaarvoice does not fail over to their hosted page if this app is down, so
 * this endpoint exists to be watched. It returns 503 when the Bazaarvoice
 * configuration is unusable — a misconfigured deployment serves a page that
 * looks fine but can never render the form, which is exactly the failure an
 * ordinary 200-only check would miss.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const { clientName, siteId, environment, locale, loaderUrl, cookieConsent, problems } =
    getBvConfig();
  const { redirectOnClose, thankYouPath } = getMpsBehaviour();
  const picker = getPickerConfig();

  const allProblems = [...problems, ...picker.problems];
  const healthy = loaderUrl !== null && picker.problems.length === 0;

  return Response.json(
    {
      status: healthy ? "ok" : "misconfigured",
      bazaarvoice: {
        clientName: clientName || null,
        siteId,
        environment,
        locale,
        loaderUrl,
        cookieConsent,
      },
      mps: { redirectOnClose, thankYouPath },
      productPicker: {
        campaignId: picker.campaignId,
        categoryId: picker.categoryId,
        familyProductId: picker.familyProductId,
        inline: picker.inline,
        preventClose: picker.preventClose,
      },
      problems: allProblems,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
