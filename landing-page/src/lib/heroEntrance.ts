// The hero building itself after the intro: the scene settles from a little larger, the letters
// of each word rise from under their line, the nav comes down, then the copy and buttons rise,
// one after another. Every animation holds its start state until its delay is up, so the hero
// stays hidden behind the intro until then.

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
// The letters: shoot out, then settle softly.
const EASE_RISE = "cubic-bezier(0.35, 0, 0, 1)";

// Only the layout on screen: the hero renders a desktop and a phone version.
function visible<T extends HTMLElement>(selector: string) {
  return [...document.querySelectorAll<T>(selector)].filter((el) => el.offsetParent);
}

export function heroEntrance(at: number): Animation[] {
  const anims: Animation[] = [];
  const rise = (el: HTMLElement, delay: number, from: string, duration = 700) =>
    anims.push(
      el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], {
        duration,
        delay,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );

  const stage = visible<HTMLElement>("[data-hero-stage]")[0];
  if (stage)
    anims.push(
      stage.animate([{ opacity: 0, transform: "scale(1.08)" }, { opacity: 1, transform: "none" }], {
        duration: 1000,
        delay: at,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );

  // Letters 35 ms apart, the second word 140 ms after the first. Each line clips its letters at
  // a line just under the text while they rise (globals.css gives it room for descenders).
  const LETTER = 900;
  visible<HTMLElement>("[data-hero-line]").forEach((line, w) => {
    const letters = [...line.querySelectorAll<HTMLElement>("[data-hero-letter]")];
    const start = at + 60 + w * 140;
    letters.forEach((l, i) =>
      anims.push(
        l.animate([{ transform: "translateY(120%)" }, { transform: "none" }], {
          duration: LETTER,
          delay: start + i * 35,
          easing: EASE_RISE,
          fill: "backwards",
        }),
      ),
    );
    const clip = "inset(-0.35em -0.1em 0 -0.1em)";
    anims.push(
      line.animate([{ clipPath: clip }, { clipPath: clip }], {
        duration: 60 + w * 140 + letters.length * 35 + LETTER,
        delay: at,
        fill: "backwards",
      }),
    );
  });

  visible<HTMLElement>("[data-nav-item]").forEach((el, i) => rise(el, at + 320 + i * 70, "translateY(-14px)", 600));
  visible<HTMLElement>("[data-hero-rise]").forEach((el, i) => rise(el, at + 420 + i * 70, "translateY(20px)"));
  return anims;
}
