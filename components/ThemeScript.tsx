import { DEFAULT_THEME, THEME_IDS, THEMES_ENABLED, THEME_STORAGE_KEY } from "@/lib/theme";
import { A11Y_STORAGE_KEY } from "@/lib/a11y";

/* Applies the saved theme and accessibility classes to <html> before first
   paint, so a returning visitor never sees a flash of the default theme. */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var ids = ${JSON.stringify(THEME_IDS)};
    var root = document.documentElement;
    /* While themes are off this ignores what is in storage — somebody who
       chose Midnight last week gets the light surface like everyone else, and
       their choice is still there for the day themes come back. */
    var theme = ${JSON.stringify(THEMES_ENABLED)}
      ? localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})
      : ${JSON.stringify(DEFAULT_THEME)};
    if (ids.indexOf(theme) === -1) theme = ${JSON.stringify(DEFAULT_THEME)};
    ids.forEach(function (id) { root.classList.remove('theme-' + id); });
    root.classList.add('theme-' + theme);

    var raw = localStorage.getItem(${JSON.stringify(A11Y_STORAGE_KEY)});
    if (raw) {
      var a = JSON.parse(raw);
      if (a.dyslexia) root.classList.add('a11y-dyslexia');
      if (a.readable) root.classList.add('a11y-readable');
      if (a.calm) root.classList.add('a11y-calm');
      if (a.contrast) root.classList.add('a11y-contrast');
      if (a.textSize === 'lg') root.classList.add('a11y-text-lg');
      if (a.textSize === 'xl') root.classList.add('a11y-text-xl');
    }
  } catch (e) {}
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
