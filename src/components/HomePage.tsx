import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  FileText,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Library,
  Link2,
  Lock,
  Menu,
  Moon,
  Play,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Video,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  HomepageContent,
  HomepageIconKey,
  HomepageImage,
  HomepageItem,
  HomepageSection,
  NavLinkItem,
  SiteSettings,
} from '../types/video';
import { HOMEPAGE_SECTION_ANCHORS } from '../lib/homepageDefaults';

interface HomePageProps {
  content: HomepageContent;
  settings: SiteSettings;
  isDark: boolean;
  isSignedIn: boolean;
  resolveImage: (src: string) => string;
  onToggleTheme: () => void;
  onStart: () => void;
  onSignIn: () => void;
  onOpenPage: (slug: string) => void;
  onOpenLibrary: () => void;
  onHome: () => void;
  onNavLink: (link: NavLinkItem) => void;
}

const ICONS: Record<HomepageIconKey, LucideIcon> = {
  video: Video,
  image: ImageIcon,
  link: Link2,
  document: FileText,
  bot: Bot,
  bookmark: Bookmark,
  brain: Brain,
  share: Share2,
  sparkles: Sparkles,
  search: Search,
  shield: ShieldCheck,
  lock: Lock,
  cloud: Cloud,
  harddrive: HardDrive,
  globe: Globe,
  clock: Clock,
  layers: Layers,
  check: Check,
  play: Play,
  arrow: ArrowRight,
};

function sectionIcon(item: HomepageItem): LucideIcon {
  return ICONS[item.icon] || Sparkles;
}

function navLinkKey(link: NavLinkItem): string {
  const target =
    link.actionType === 'url' ? link.target.trim().replace(/\/+$/, '').toLowerCase() : link.target.trim();
  return `${link.actionType}:${target}`;
}

function visibleLinks(links: NavLinkItem[], settings: SiteSettings): NavLinkItem[] {
  const seen = new Set<string>();
  return links
    .filter((link) => {
      if (!link.visible) return false;
      if (link.actionType === 'view' && link.target === 'pricing' && !settings.pricingEnabled) {
        return false;
      }
      if (link.actionType === 'view' && link.target === 'checkout' && !settings.checkoutEnabled) {
        return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((link) => {
      // Collapse accidental duplicate destinations saved in the nav editor.
      const key = navLinkKey(link);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function SectionHeading({
  section,
  align = 'left',
}: {
  section: HomepageSection;
  align?: 'left' | 'center';
}) {
  const hasContent = Boolean(
    section.badge || section.eyebrow || section.title || section.accent || section.description
  );
  if (!hasContent) return null;
  return (
    <div className={`max-w-2xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      {section.badge ? (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--hp-border)] bg-[var(--hp-panel)] px-3 py-1.5 text-[11px] font-medium text-[var(--hp-text-soft)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--hp-accent-text)]" aria-hidden="true" />
          {section.badge}
        </div>
      ) : null}
      {section.eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hp-accent-text)]">
          {section.eyebrow}
        </p>
      ) : null}
      <h2
        className={`text-2xl font-bold tracking-[-0.02em] text-[var(--hp-text)] sm:text-3xl lg:text-[2.15rem] lg:leading-tight ${
          section.badge ? 'mt-1' : ''
        }`}
      >
        {section.title}
        {section.accent ? (
          <>
            {section.title ? <br /> : null}
            <span className="text-[var(--hp-accent-text)]">{section.accent}</span>
          </>
        ) : null}
      </h2>
      {section.description ? (
        <p className="mt-4 text-sm leading-[1.7] text-[var(--hp-muted)] sm:text-base">
          {section.description}
        </p>
      ) : null}
    </div>
  );
}

function SectionImage({
  image,
  resolveImage,
  className = '',
}: {
  image: HomepageImage;
  resolveImage: (src: string) => string;
  className?: string;
}) {
  const src = image.src ? resolveImage(image.src) : '';
  if (!src) return null;
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] shadow-[var(--hp-shadow)] ${className}`}
    >
      <img
        src={src}
        alt={image.alt || ''}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function itemImage(
  item: HomepageItem,
  resolveImage: (src: string) => string,
  className = ''
): React.ReactNode {
  const src = item.image.src ? resolveImage(item.image.src) : '';
  if (!src) return null;
  return (
    <img
      src={src}
      alt={item.image.alt || item.title}
      loading="lazy"
      className={`object-cover ${className}`}
    />
  );
}

function PrimaryButton({
  label,
  onClick,
  href,
  className = '',
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--hp-accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--hp-accent-hover)] ${className}`;
  if (href) {
    return (
      <a href={href} className={classes}>
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function SecondaryButton({
  label,
  onClick,
  href,
  icon: Icon = ChevronRight,
  className = '',
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--hp-border)] bg-[var(--hp-panel)] px-5 py-3 text-sm font-medium text-[var(--hp-text-soft)] transition-colors hover:border-[var(--hp-border-strong)] hover:text-[var(--hp-text)] ${className}`;
  if (href) {
    return (
      <a href={href} className={classes}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function HeroPreview({
  items,
  resolveImage,
}: {
  items: HomepageItem[];
  resolveImage: (src: string) => string;
}) {
  const previewItems = items.slice(0, 3);
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-[520px] lg:max-w-none">
      <div
        className="pointer-events-none absolute -inset-6 rounded-[36px] bg-[var(--hp-accent)]/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative overflow-hidden rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] shadow-[var(--hp-shadow)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--hp-border)] bg-[var(--hp-panel-soft)] px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] px-3 py-1.5 text-[10px] text-[var(--hp-subtle)]">
            <Search className="h-3 w-3" aria-hidden="true" />
            Search your library…
          </div>
          <span className="hidden rounded-md border border-[var(--hp-border)] px-2 py-1 text-[10px] font-medium text-[var(--hp-accent-text)] sm:inline">
            Library
          </span>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between text-[10px] text-[var(--hp-subtle)]">
            <span className="font-medium uppercase tracking-[0.16em]">All items</span>
            <span>{Math.max(previewItems.length, 1)} saved</span>
          </div>

          {previewItems.length === 0 ? (
            <div className="rounded-xl border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] p-4 text-[11px] text-[var(--hp-muted)]">
              Your saved videos, screenshots, and links appear here.
            </div>
          ) : (
            previewItems.map((item) => {
              const Icon = sectionIcon(item);
              const imageSrc = item.image.src ? resolveImage(item.image.src) : '';
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] p-3"
                >
                  <div className="flex items-start gap-3">
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--hp-accent-soft)] text-[var(--hp-accent-text)]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--hp-text)]">
                        {item.title || 'Saved item'}
                      </p>
                      {item.description ? (
                        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--hp-muted)]">
                          {item.description}
                        </p>
                      ) : null}
                      {item.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-[var(--hp-border)] px-1.5 py-0.5 text-[9px] text-[var(--hp-muted)]"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div className="rounded-xl border border-[var(--hp-accent-border)] bg-[var(--hp-accent-soft)] p-3">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--hp-accent-text)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI summary
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--hp-text-soft)]">
              What it does · How it works · Useful tools mentioned · Key points
            </p>
          </div>
        </div>
      </div>

      <div className="absolute -right-3 -top-12 hidden rounded-xl border border-[var(--hp-border)] bg-[var(--hp-panel)] px-3 py-2 shadow-xl sm:block">
        <p className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--hp-text)]">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--hp-success)]" aria-hidden="true" />
          Saved in seconds
        </p>
        <p className="mt-0.5 text-[9px] text-[var(--hp-subtle)]">Organized automatically</p>
      </div>
    </div>
  );
}

function HeroSection({
  section,
  resolveImage,
  onStart,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
  onStart: () => void;
}) {
  const demoAnchor = HOMEPAGE_SECTION_ANCHORS['product-flow'];
  return (
    <section id={HOMEPAGE_SECTION_ANCHORS.hero} className="relative scroll-mt-24 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[var(--hp-hero-glow)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid max-w-[1120px] items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:pb-28 lg:pt-24">
        <div className="min-w-0">
          {section.badge ? (
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--hp-border)] bg-[var(--hp-panel)] px-3 py-1.5 text-[11px] font-medium text-[var(--hp-text-soft)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--hp-accent-text)]" aria-hidden="true" />
              {section.badge}
            </div>
          ) : null}
          <h1
            className="text-[2.6rem] leading-[1.04] tracking-[-0.04em] text-[var(--hp-text)] sm:text-5xl lg:text-[3.6rem]"
            style={{ fontWeight: 750 }}
          >
            {section.title}
            {section.accent ? (
              <>
                <br />
                <span className="text-[var(--hp-accent-text)]">{section.accent}</span>
              </>
            ) : null}
          </h1>
          {section.description ? (
            <p className="mt-5 max-w-xl text-[15px] leading-[1.7] text-[var(--hp-text-soft)] sm:text-base lg:text-lg">
              {section.description}
            </p>
          ) : null}

          {section.items.length > 0 ? (
            <ul className="mt-7 grid max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
              {section.items.map((item) => {
                const Icon = sectionIcon(item);
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-xl border border-[var(--hp-border)] bg-[var(--hp-panel)] px-3 py-2.5 text-xs text-[var(--hp-text-soft)] sm:text-[13px]"
                  >
                    {item.image.src && resolveImage(item.image.src) ? (
                      <img
                        src={resolveImage(item.image.src)}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--hp-accent-soft)] text-[var(--hp-accent-text)]">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    )}
                    {item.title}
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {section.ctaLabel ? (
              <PrimaryButton label={section.ctaLabel} onClick={onStart} />
            ) : null}
            {section.ctaSecondaryLabel ? (
              <SecondaryButton
                label={section.ctaSecondaryLabel}
                href={`#${demoAnchor}`}
                icon={Play}
              />
            ) : null}
          </div>
          {section.note ? (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-[var(--hp-muted)]">
              <Check className="h-3.5 w-3.5 text-[var(--hp-success)]" aria-hidden="true" />
              {section.note}
            </p>
          ) : null}
        </div>

        {section.image.src && resolveImage(section.image.src) ? (
          <SectionImage
            image={section.image}
            resolveImage={resolveImage}
            className="w-full"
          />
        ) : (
          <HeroPreview items={section.items} resolveImage={resolveImage} />
        )}
      </div>
    </section>
  );
}

function ProblemSection({
  section,
  resolveImage,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
}) {
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS.problem}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <SectionHeading section={section} />
        {section.image.src ? (
          <SectionImage image={section.image} resolveImage={resolveImage} className="mt-8 max-h-80" />
        ) : null}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {section.items.map((item) => {
            const Icon = sectionIcon(item);
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] p-5 transition-colors hover:border-[var(--hp-border-strong)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hp-panel-alt)] text-[var(--hp-accent-text)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold leading-snug text-[var(--hp-text)]">
                  {item.title}
                </h3>
                {item.description ? (
                  <p className="mt-2 text-sm leading-[1.65] text-[var(--hp-muted)]">
                    {item.description}
                  </p>
                ) : null}
                {itemImage(
                  item,
                  resolveImage,
                  'mt-4 h-32 w-full rounded-lg border border-[var(--hp-border)]'
                )}
                {item.tags.length > 0 ? (
                  <div className="mt-4 space-y-1.5">
                    {item.tags.map((tag) => (
                      <div
                        key={tag}
                        className="flex items-center gap-2 rounded-lg border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] px-2.5 py-1.5 text-[11px] text-[var(--hp-subtle)]"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hp-faint)]" />
                        <span className="truncate">{tag}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        {section.note ? (
          <div className="mt-8 rounded-2xl border border-[var(--hp-accent-border)] bg-[var(--hp-accent-soft)] px-5 py-5 sm:px-6">
            <p className="text-sm font-medium leading-relaxed text-[var(--hp-text-soft)] sm:text-base">
              {section.note}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StepsSection({
  section,
  resolveImage,
  onStart,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
  onStart: () => void;
}) {
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS.steps}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <SectionHeading section={section} />
        {section.image.src ? (
          <SectionImage image={section.image} resolveImage={resolveImage} className="mt-8 max-h-80" />
        ) : null}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {section.items.map((item, index) => {
            const Icon = sectionIcon(item);
            return (
              <article
                key={item.id}
                className="relative rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hp-accent-soft)] text-[var(--hp-accent-text)]">
                    {item.image.src && resolveImage(item.image.src) ? (
                      <img
                        src={resolveImage(item.image.src)}
                        alt=""
                        className="h-10 w-10 rounded-xl object-cover"
                      />
                    ) : (
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    )}
                  </div>
                  <span className="font-mono text-2xl font-semibold tracking-tight text-[var(--hp-border-strong)]">
                    {item.label || String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-[var(--hp-text)]">{item.title}</h3>
                {item.description ? (
                  <p className="mt-2 text-sm leading-[1.65] text-[var(--hp-muted)]">
                    {item.description}
                  </p>
                ) : null}
                {item.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[var(--hp-border)] px-2 py-0.5 text-[10px] text-[var(--hp-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        {section.ctaLabel ? (
          <div className="mt-7">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--hp-accent-text)] hover:text-[var(--hp-text)]"
            >
              {section.ctaLabel}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ContentTypesSection({
  section,
  resolveImage,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
}) {
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS['content-types']}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <SectionHeading section={section} />
        {section.image.src ? (
          <SectionImage image={section.image} resolveImage={resolveImage} className="mt-8 max-h-80" />
        ) : null}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item) => {
            const Icon = sectionIcon(item);
            const src = item.image.src ? resolveImage(item.image.src) : '';
            return (
              <article
                key={item.id}
                className="group overflow-hidden rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] transition-colors hover:border-[var(--hp-border-strong)]"
              >
                {src ? (
                  <img
                    src={src}
                    alt={item.image.alt || item.title}
                    loading="lazy"
                    className="h-36 w-full object-cover"
                  />
                ) : null}
                <div className="p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hp-panel-alt)] text-[var(--hp-accent-text)] transition-colors group-hover:bg-[var(--hp-accent-soft)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[var(--hp-text)]">
                    {item.title}
                  </h3>
                  {item.description ? (
                    <p className="mt-2 text-sm leading-[1.65] text-[var(--hp-muted)]">
                      {item.description}
                    </p>
                  ) : null}
                  {item.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[var(--hp-border)] px-2 py-0.5 text-[10px] text-[var(--hp-muted)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TransformationSection({
  section,
  resolveImage,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
}) {
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS.transformation}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <SectionHeading section={section} />
        {section.image.src ? (
          <SectionImage image={section.image} resolveImage={resolveImage} className="mt-8 max-h-80" />
        ) : null}
        <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hp-subtle)]">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {section.beforeLabel || 'Before'}
            </div>
            <div className="mt-4 space-y-2">
              {section.items.map((item) => {
                const src = item.image.src ? resolveImage(item.image.src) : '';
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-xl border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] px-3 py-2.5 text-xs text-[var(--hp-muted)]"
                  >
                    {src ? (
                      <img src={src} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--hp-faint)]" />
                    )}
                    <span className="truncate">{item.title}</span>
                  </div>
                );
              })}
            </div>
            {section.note ? (
              <p className="mt-4 text-xs leading-relaxed text-[var(--hp-subtle)]">{section.note}</p>
            ) : null}
          </div>

          <div className="hidden items-center justify-center lg:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hp-border)] bg-[var(--hp-panel-alt)] text-[var(--hp-accent-text)]">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--hp-accent-border)] bg-[var(--hp-panel)] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hp-accent-text)]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {section.afterLabel || 'After'}
            </div>
            <h3 className="mt-4 text-base font-semibold text-[var(--hp-text)]">
              {section.secondaryTitle || 'Organized and searchable'}
            </h3>
            {section.secondaryText ? (
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--hp-muted)]">
                {section.secondaryText}
              </p>
            ) : null}
            {section.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {section.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[var(--hp-border)] px-2 py-0.5 text-[10px] text-[var(--hp-muted)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
            {section.image.src ? (
              <img
                src={resolveImage(section.image.src)}
                alt={section.image.alt || section.title}
                loading="lazy"
                className="mt-4 h-28 w-full rounded-xl border border-[var(--hp-border)] object-cover"
              />
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {['What it does', 'How it works', 'Useful tools mentioned', 'Key points'].map(
                  (field) => (
                    <div
                      key={field}
                      className="rounded-lg border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] px-2.5 py-2 text-[10px] text-[var(--hp-text-soft)]"
                    >
                      {field}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SearchDemoSection({
  section,
  resolveImage,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
}) {
  const query = section.secondaryText || 'Search your library';
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS['search-demo']}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto grid max-w-[1120px] gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <SectionHeading section={section} />
        <div className="rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] p-4 sm:p-5">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-[var(--hp-subtle)]" aria-hidden="true" />
            <span className="truncate text-sm text-[var(--hp-text-soft)]">{query}</span>
            <span className="ml-auto rounded-md border border-[var(--hp-border)] px-1.5 py-0.5 text-[9px] text-[var(--hp-subtle)]">
              Enter
            </span>
          </div>
          {section.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {section.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] px-2.5 py-1 text-[10px] text-[var(--hp-muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-4 rounded-xl border border-[var(--hp-border)] bg-[var(--hp-panel-soft)] p-3">
            <div className="flex items-start gap-3">
              {section.image.src ? (
                <img
                  src={resolveImage(section.image.src)}
                  alt={section.image.alt || section.secondaryTitle}
                  loading="lazy"
                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--hp-accent-soft)] text-[var(--hp-accent-text)]">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--hp-text)]">
                  {section.secondaryTitle || 'Matching saved item'}
                </p>
                {section.note ? (
                  <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--hp-muted)]">
                    {section.note}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1 text-[9px] text-[var(--hp-subtle)]">
                  <span className="rounded-full bg-[var(--hp-success-soft)] px-1.5 py-0.5 text-[var(--hp-success-text)]">
                    Strong match
                  </span>
                  {section.tags.slice(0, 2).map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-[var(--hp-subtle)]">
            <CheckCircle2
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--hp-success)]"
              aria-hidden="true"
            />
            Search across your saved content. No digging through chats or galleries.
          </p>
        </div>
      </div>
    </section>
  );
}

function ProductFlowSection({
  section,
  resolveImage,
  onStart,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
  onStart: () => void;
}) {
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS['product-flow']}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <SectionHeading section={section} />
        {section.image.src ? (
          <SectionImage image={section.image} resolveImage={resolveImage} className="mt-8 max-h-80" />
        ) : null}
        <div className="mt-10 overflow-hidden rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hp-border)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--hp-text-soft)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--hp-accent-soft)] text-[var(--hp-accent-text)]">
                <Layers className="h-4 w-4" aria-hidden="true" />
              </span>
              {section.secondaryTitle || 'Save → organize → find'}
            </div>
            {section.secondaryText ? (
              <span className="rounded-full border border-[var(--hp-border)] px-2.5 py-1 text-[10px] text-[var(--hp-subtle)]">
                {section.secondaryText}
              </span>
            ) : null}
          </div>
          <div className="grid divide-y divide-[var(--hp-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {section.items.map((item, index) => {
              const Icon = sectionIcon(item);
              const src = item.image.src ? resolveImage(item.image.src) : '';
              return (
                <div key={item.id} className="p-5">
                  <div className="flex items-center justify-between">
                    {src ? (
                      <img src={src} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--hp-panel-alt)] text-[var(--hp-accent-text)]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-[var(--hp-subtle)]">
                      {item.label || `0${index + 1}`}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--hp-text)]">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--hp-muted)]">
                      {item.description}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 border-t border-[var(--hp-border)] bg-[var(--hp-panel-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-[var(--hp-muted)]">{section.note}</p>
            {section.ctaLabel ? (
              <button
                type="button"
                onClick={onStart}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--hp-accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--hp-accent-hover)]"
              >
                {section.ctaLabel}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection({
  section,
  resolveImage,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
}) {
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS.features}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <SectionHeading section={section} />
        {section.image.src ? (
          <SectionImage image={section.image} resolveImage={resolveImage} className="mt-8 max-h-80" />
        ) : null}
        {section.tags.length > 0 ? (
          <div className="mt-8 flex flex-wrap gap-2.5">
            {section.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hp-border)] bg-[var(--hp-panel)] px-3.5 py-2 text-xs font-medium text-[var(--hp-text-soft)]"
              >
                <Check className="h-3.5 w-3.5 text-[var(--hp-success)]" aria-hidden="true" />
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {section.items.length > 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const Icon = sectionIcon(item);
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] p-5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hp-panel-alt)] text-[var(--hp-accent-text)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-[var(--hp-text)]">{item.title}</h3>
                  {item.description ? (
                    <p className="mt-2 text-sm leading-[1.65] text-[var(--hp-muted)]">
                      {item.description}
                    </p>
                  ) : null}
                  {itemImage(
                    item,
                    resolveImage,
                    'mt-3 h-28 w-full rounded-lg border border-[var(--hp-border)]'
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PrivacySection({
  section,
  resolveImage,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
}) {
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS.privacy}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <SectionHeading section={section} />
        {section.image.src ? (
          <SectionImage image={section.image} resolveImage={resolveImage} className="mt-8 max-h-80" />
        ) : null}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {section.items.map((item) => {
            const Icon = sectionIcon(item);
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[var(--hp-border)] bg-[var(--hp-panel)] p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hp-success-soft)] text-[var(--hp-success-text)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--hp-text)]">
                  <ShieldCheck className="h-4 w-4 text-[var(--hp-success)]" aria-hidden="true" />
                  {item.title}
                </h3>
                {item.description ? (
                  <p className="mt-2 text-sm leading-[1.65] text-[var(--hp-muted)]">
                    {item.description}
                  </p>
                ) : null}
                {itemImage(
                  item,
                  resolveImage,
                  'mt-3 h-28 w-full rounded-lg border border-[var(--hp-border)]'
                )}
                {item.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[var(--hp-border)] px-2 py-0.5 text-[10px] text-[var(--hp-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CtaSection({
  section,
  resolveImage,
  onStart,
  onSignIn,
  isSignedIn,
}: {
  section: HomepageSection;
  resolveImage: (src: string) => string;
  onStart: () => void;
  onSignIn: () => void;
  isSignedIn: boolean;
}) {
  const imageSrc = section.image.src ? resolveImage(section.image.src) : '';
  return (
    <section
      id={HOMEPAGE_SECTION_ANCHORS.cta}
      className="scroll-mt-24 border-t border-[var(--hp-border)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--hp-accent-border)] bg-[var(--hp-panel)] px-6 py-10 sm:px-10 sm:py-12">
          <div
            className="pointer-events-none absolute inset-0 bg-[var(--hp-cta-glow)]"
            aria-hidden="true"
          />
          <div className={`relative ${imageSrc ? 'grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center' : ''}`}>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-[var(--hp-text)] sm:text-3xl">
                {section.title}
                {section.accent ? (
                  <span className="block text-[var(--hp-accent-text)]">{section.accent}</span>
                ) : null}
              </h2>
              {section.description ? (
                <p className="mt-3 text-sm leading-[1.7] text-[var(--hp-text-soft)] sm:text-base">
                  {section.description}
                </p>
              ) : null}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                {section.ctaLabel ? (
                  <PrimaryButton label={section.ctaLabel} onClick={onStart} />
                ) : null}
                {!isSignedIn && section.ctaSecondaryLabel ? (
                  <SecondaryButton
                    label={section.ctaSecondaryLabel}
                    onClick={onSignIn}
                    icon={ChevronRight}
                  />
                ) : null}
              </div>
              {section.note ? (
                <p className="mt-4 text-xs text-[var(--hp-muted)]">{section.note}</p>
              ) : null}
            </div>
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={section.image.alt || section.title}
                loading="lazy"
                className="w-full rounded-2xl border border-[var(--hp-border)] object-cover"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomePage({
  content,
  settings,
  isDark,
  isSignedIn,
  resolveImage,
  onToggleTheme,
  onStart,
  onSignIn,
  onOpenPage,
  onOpenLibrary,
  onHome,
  onNavLink,
}: HomePageProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const close = () => setMobileOpen(false);
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const headerLinks = useMemo(() => visibleLinks(settings.headerLinks, settings), [settings]);
  const footerLinks = useMemo(() => visibleLinks(settings.footerLinks, settings), [settings]);
  const hasLibraryNavLink = headerLinks.some(
    (link) => link.actionType === 'view' && link.target === 'library'
  );
  const sections = content.sections.filter((section) => section.enabled);
  const logoUrl = settings.logoUrl ? resolveImage(settings.logoUrl) : '';
  const brandName = settings.siteName || 'ClipIndex';
  const primaryCtaLabel =
    content.sections.find((s) => s.kind === 'hero')?.ctaLabel || 'Start saving for free';

  const closeMobile = () => setMobileOpen(false);

  const renderLink = (link: NavLinkItem, mobile: boolean) => {
    const className = mobile
      ? 'rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--hp-text-soft)] hover:bg-[var(--hp-panel-alt)] hover:text-[var(--hp-text)]'
      : 'text-sm text-[var(--hp-text-soft)] transition-colors hover:text-[var(--hp-text)]';

    if (link.actionType === 'url') {
      return (
        <a
          key={link.id}
          href={link.target}
          target={link.openInNewTab ? '_blank' : undefined}
          rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
          onClick={closeMobile}
          className={className}
        >
          {link.label}
        </a>
      );
    }
    if (link.actionType === 'anchor') {
      return (
        <a
          key={link.id}
          href={`#${link.target}`}
          onClick={closeMobile}
          className={className}
        >
          {link.label}
        </a>
      );
    }
    return (
      <button
        key={link.id}
        type="button"
        onClick={() => {
          closeMobile();
          onNavLink(link);
        }}
        className={`${className} text-left`}
      >
        {link.label}
      </button>
    );
  };

  const renderSection = (section: HomepageSection) => {
    switch (section.kind) {
      case 'hero':
        return <HeroSection key={section.id} section={section} resolveImage={resolveImage} onStart={onStart} />;
      case 'problem':
        return <ProblemSection key={section.id} section={section} resolveImage={resolveImage} />;
      case 'steps':
        return (
          <StepsSection key={section.id} section={section} resolveImage={resolveImage} onStart={onStart} />
        );
      case 'content-types':
        return <ContentTypesSection key={section.id} section={section} resolveImage={resolveImage} />;
      case 'transformation':
        return <TransformationSection key={section.id} section={section} resolveImage={resolveImage} />;
      case 'search-demo':
        return <SearchDemoSection key={section.id} section={section} resolveImage={resolveImage} />;
      case 'product-flow':
        return (
          <ProductFlowSection
            key={section.id}
            section={section}
            resolveImage={resolveImage}
            onStart={onStart}
          />
        );
      case 'features':
        return <FeaturesSection key={section.id} section={section} resolveImage={resolveImage} />;
      case 'privacy':
        return <PrivacySection key={section.id} section={section} resolveImage={resolveImage} />;
      case 'cta':
        return (
          <CtaSection
            key={section.id}
            section={section}
            resolveImage={resolveImage}
            onStart={onStart}
            onSignIn={onSignIn}
            isSignedIn={isSignedIn}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen scroll-smooth bg-[var(--hp-bg)] font-body text-[var(--hp-text)] selection:bg-[var(--hp-accent)] selection:text-white">
      <a
        href={`#${HOMEPAGE_SECTION_ANCHORS.hero}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-[var(--hp-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--hp-border)] bg-[var(--hp-bg)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-5 sm:px-8">
          <button
            type="button"
            onClick={() => {
              closeMobile();
              onHome();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex min-w-0 items-center gap-2.5"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={brandName}
                referrerPolicy="no-referrer"
                className="h-8 max-w-[150px] object-contain"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--hp-accent)] text-sm font-extrabold text-white shadow-lg shadow-blue-600/20">
                {brandName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-lg font-bold tracking-[-0.02em] text-[var(--hp-text)]">
              {brandName}
            </span>
          </button>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
            {headerLinks.map((link) => renderLink(link, false))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-lg p-2 text-[var(--hp-text-soft)] transition-colors hover:bg-[var(--hp-panel-alt)] hover:text-[var(--hp-text)]"
            >
              {isDark ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            {!hasLibraryNavLink ? (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--hp-text-soft)] transition-colors hover:bg-[var(--hp-panel-alt)] hover:text-[var(--hp-text)]"
              >
                <Library className="h-4 w-4" aria-hidden="true" />
                Library
              </button>
            ) : null}
            {!isSignedIn ? (
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--hp-text-soft)] transition-colors hover:bg-[var(--hp-panel-alt)] hover:text-[var(--hp-text)]"
              >
                Sign in
              </button>
            ) : null}
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--hp-accent)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--hp-accent-hover)]"
            >
              {primaryCtaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-lg p-2 text-[var(--hp-text-soft)] transition-colors hover:bg-[var(--hp-panel-alt)]"
            >
              {isDark ? (
                <Sun className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Moon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onOpenLibrary}
              aria-label="Open my library"
              className="rounded-lg p-2 text-[var(--hp-text-soft)] transition-colors hover:bg-[var(--hp-panel-alt)]"
            >
              <Library className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-lg p-2 text-[var(--hp-text-soft)] transition-colors hover:bg-[var(--hp-panel-alt)]"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-[var(--hp-border)] bg-[var(--hp-bg)] px-5 pb-5 pt-3 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
              {headerLinks.map((link) => renderLink(link, true))}
            </nav>
            <div className="mt-3 flex flex-col gap-2">
              {!hasLibraryNavLink ? (
                <button
                  type="button"
                  onClick={() => {
                    closeMobile();
                    onOpenLibrary();
                  }}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--hp-border)] px-4 py-2.5 text-sm font-medium text-[var(--hp-text-soft)]"
                >
                  <Library className="h-4 w-4" aria-hidden="true" />
                  Library
                </button>
              ) : null}
              {!isSignedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    closeMobile();
                    onSignIn();
                  }}
                  className="w-full rounded-xl border border-[var(--hp-border)] px-4 py-2.5 text-sm font-medium text-[var(--hp-text-soft)]"
                >
                  Sign in
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  onStart();
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--hp-accent)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                {primaryCtaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <main>{sections.map(renderSection)}</main>

      {/* Footer */}
      <footer className="border-t border-[var(--hp-border)] py-10">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <button
              type="button"
              onClick={() => {
                onHome();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2.5"
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={brandName}
                  referrerPolicy="no-referrer"
                  className="h-7 max-w-[130px] object-contain"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--hp-accent)] text-xs font-extrabold text-white">
                  {brandName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-base font-bold text-[var(--hp-text)]">{brandName}</span>
            </button>
            <p className="mt-2 text-xs text-[var(--hp-subtle)]">
              {settings.footerText?.trim() ||
                settings.tagline ||
                'Save now. Find anytime.'}
            </p>
          </div>
          <nav
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--hp-muted)]"
            aria-label="Footer"
          >
            {footerLinks.map((link) => renderLink(link, false))}
            {footerLinks.length === 0 ? (
              <>
                <a href="#how-it-works" className="transition-colors hover:text-[var(--hp-text)]">
                  About
                </a>
                <button
                  type="button"
                  onClick={() => onOpenPage('privacy-policy')}
                  className="transition-colors hover:text-[var(--hp-text)]"
                >
                  Privacy Policy
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPage('terms-of-service')}
                  className="transition-colors hover:text-[var(--hp-text)]"
                >
                  Terms of Service
                </button>
              </>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  );
}
