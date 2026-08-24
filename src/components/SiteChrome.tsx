import { getBrandConfig } from "@/lib/config";

export function SiteHeader() {
  const brand = getBrandConfig();

  const inner = (
    <>
      {brand.logoUrl ? (
        // Plain <img>: the logo is an arbitrary operator-supplied URL, so
        // next/image's remote-pattern allowlist would have to be edited every
        // time the brand asset moves. Add the host to CSP_EXTRA_IMG_SRC instead.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="site-header__logo" src={brand.logoUrl} alt={brand.name} />
      ) : (
        <span>{brand.name}</span>
      )}
    </>
  );

  return (
    <header className="site-header">
      <div className="site-header__inner">
        {brand.homeUrl ? (
          <a className="site-header__brand" href={brand.homeUrl}>
            {inner}
          </a>
        ) : (
          <span className="site-header__brand">{inner}</span>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  const brand = getBrandConfig();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <span>
          &copy; {new Date().getFullYear()} {brand.name}
        </span>
        {brand.homeUrl ? <a href={brand.homeUrl}>Return to {brand.name}</a> : null}
      </div>
    </footer>
  );
}
