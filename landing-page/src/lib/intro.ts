// Runs in <head>, before the first paint. Every load of the home page starts from the top with the
// intro (components/Intro.tsx), so its cover is there from the start: a reload too, even after
// a nav link put a section in the address (/#faq), which is cleared. Only a fresh visit to a
// section link, such as a shared /#faq, goes straight to that section without the intro.
// The browser never restores an old position on its own: a section link scrolls to its section.
// While html has data-intro (the intro is playing) or data-settling (the hero is still building
// itself after it), heavy work such as the 3D scene waits, so it never makes the intro stutter.
// Resolves at once when there is no intro.
export function whenIntroSettled(): Promise<void> {
  const html = document.documentElement;
  const busy = () => "intro" in html.dataset || "settling" in html.dataset;
  if (!busy()) return Promise.resolve();
  return new Promise((resolve) => {
    const watch = new MutationObserver(() => {
      if (busy()) return;
      watch.disconnect();
      resolve();
    });
    watch.observe(html, { attributes: true, attributeFilter: ["data-intro", "data-settling"] });
  });
}

export const HEAD_SCRIPT = `try{history.scrollRestoration="manual";var n=performance.getEntriesByType("navigation")[0];if(n&&n.type==="reload"&&location.hash)history.replaceState(null,"",location.pathname+location.search);if(!location.hash&&location.pathname==="/"){scrollTo(0,0);document.documentElement.dataset.intro=""}}catch(e){}`;
