// Runs in <head>, before the first paint. Every load starts from the top of the page with the
// intro (components/Intro.tsx), so its cover is there from the start: a reload too, even after
// a nav link put a section in the address (/#faq), which is cleared. Only a fresh visit to a
// section link, such as a shared /#faq, goes straight to that section without the intro.
// The browser never restores an old position on its own: a section link scrolls to its section.
export const HEAD_SCRIPT = `try{history.scrollRestoration="manual";var n=performance.getEntriesByType("navigation")[0];if(n&&n.type==="reload"&&location.hash)history.replaceState(null,"",location.pathname+location.search);if(!location.hash){scrollTo(0,0);document.documentElement.dataset.intro=""}}catch(e){}`;
