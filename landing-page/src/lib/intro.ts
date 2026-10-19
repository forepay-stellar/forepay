// Whether the first-visit intro (components/Intro.tsx) plays is decided in <head>, before the
// first paint, so its cover is there from the start and a returning visit never sees it flash.
// It plays once per session, and not when the link goes straight to a section (/#faq).

export const INTRO_SEEN = "forepay:intro";

export const INTRO_SCRIPT = `try{if(!location.hash&&!sessionStorage.getItem("${INTRO_SEEN}")){document.documentElement.dataset.intro=""}}catch(e){}`;
