import Link from "next/link";
import { Fragment } from "react";
import type { Inline, LegalDocument, Paragraph } from "@/content/legal";
import { landing } from "@/content/landing";
import { cn } from "@/lib/cn";
import { APP_URL } from "@/lib/env";
import { Footer } from "@/sections/Footer";
import { Mark, Wordmark } from "./brand/Logo";
import { ButtonLink } from "./Button";

// The privacy policy and terms (#85). Documents, not marketing: one readable column on the
// canvas, the app's type scale, no motion. The bar keeps the logo (home) and the app button.
const LINK = "font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg";

function Run({ part }: { part: Inline }) {
  if (typeof part === "string") return part;
  if ("code" in part) {
    return <code className="rounded-chip bg-subtle px-1.5 py-0.5 font-mono text-[0.875em] [overflow-wrap:anywhere]">{part.code}</code>;
  }
  if (part.href.startsWith("/")) {
    return (
      <Link href={part.href} className={LINK}>
        {part.text}
      </Link>
    );
  }
  const external = part.href.startsWith("http");
  return (
    <a href={part.href} className={LINK} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {part.text}
    </a>
  );
}

function Text({ p }: { p: Paragraph }) {
  if (typeof p === "string") return p;
  return p.map((part, i) => (
    <Fragment key={i}>
      <Run part={part} />
    </Fragment>
  ));
}

function Paragraphs({ list }: { list?: readonly Paragraph[] }) {
  return list?.map((p, i) => (
    <p key={i}>
      <Text p={p} />
    </p>
  ));
}

export function LegalPage({ doc }: { doc: LegalDocument }) {
  return (
    <>
      <header className="mx-auto flex h-15 max-w-[1440px] items-center justify-between px-4 md:h-20 md:px-10 lg:px-20">
        <Link href="/" aria-label="Forepay, home">
          <Mark aria-hidden className="md:hidden" />
          <Wordmark aria-hidden className="hidden w-[180px] md:block" />
        </Link>
        <ButtonLink href={APP_URL} size="sm" className="md:px-[22px] md:py-3 md:text-sm">
          {landing.nav.cta}
        </ButtonLink>
      </header>

      <main className="mx-auto max-w-[720px] px-5 pt-10 pb-20 md:pt-16 md:pb-28">
        <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.03em] md:text-page">{doc.title}</h1>
        <p className="mt-3 text-body-sm text-fg-muted">{doc.effective}</p>

        <div className="mt-8 flex flex-col gap-4 text-base leading-relaxed">
          <Paragraphs list={doc.intro} />
        </div>

        {doc.sections.map((s) => (
          <section
            key={s.heading}
            aria-labelledby={slug(s.heading)}
            className={cn(
              "mt-10 flex flex-col gap-4 text-base leading-relaxed",
              s.prominent && "rounded-card bg-brand-subtle p-6 md:p-8",
            )}
          >
            <h2 id={slug(s.heading)} className={cn("text-xl font-semibold tracking-[-0.01em]", s.prominent && "text-brand-strong")}>
              {s.heading}
            </h2>
            <Paragraphs list={s.paragraphs} />
            {s.items && (
              <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-brand">
                {s.items.map((item, i) => (
                  <li key={i}>
                    <Text p={item} />
                  </li>
                ))}
              </ul>
            )}
            <Paragraphs list={s.after} />
          </section>
        ))}
      </main>

      <Footer />
    </>
  );
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
