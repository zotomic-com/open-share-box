import type {
  HomepageContent,
  HomepageIconKey,
  HomepageImage,
  HomepageItem,
  HomepageSection,
  HomepageSectionKind,
} from '../types/video';

export const HOMEPAGE_SECTION_ANCHORS: Record<HomepageSectionKind, string> = {
  hero: 'hero',
  problem: 'problem',
  steps: 'how-it-works',
  'content-types': 'what-you-can-save',
  transformation: 'transformation',
  'search-demo': 'search',
  'product-flow': 'product-demo',
  features: 'features',
  privacy: 'privacy',
  cta: 'get-started',
};

export const HOMEPAGE_ICON_OPTIONS: Array<{ key: HomepageIconKey; label: string }> = [
  { key: 'video', label: 'Video' },
  { key: 'image', label: 'Image / Screenshot' },
  { key: 'link', label: 'Link' },
  { key: 'document', label: 'Document' },
  { key: 'bot', label: 'AI / Bot' },
  { key: 'bookmark', label: 'Bookmark' },
  { key: 'brain', label: 'Knowledge' },
  { key: 'share', label: 'Share' },
  { key: 'sparkles', label: 'Sparkles' },
  { key: 'search', label: 'Search' },
  { key: 'shield', label: 'Privacy / Shield' },
  { key: 'lock', label: 'Lock' },
  { key: 'cloud', label: 'Cloud' },
  { key: 'harddrive', label: 'Local storage' },
  { key: 'globe', label: 'Website' },
  { key: 'clock', label: 'Time' },
  { key: 'layers', label: 'Layers' },
  { key: 'check', label: 'Check' },
  { key: 'play', label: 'Play' },
  { key: 'arrow', label: 'Arrow' },
];

const MEDIA_REF_PREFIX = 'media:';

export function isMediaRef(src: string): boolean {
  return typeof src === 'string' && src.startsWith(MEDIA_REF_PREFIX);
}

export function mediaIdFromRef(src: string): string {
  return isMediaRef(src) ? src.slice(MEDIA_REF_PREFIX.length) : '';
}

export function sanitizeImageRef(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  if (value.startsWith(MEDIA_REF_PREFIX)) {
    const id = value.slice(MEDIA_REF_PREFIX.length).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    return id ? `${MEDIA_REF_PREFIX}${id}` : '';
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function sanitizeText(raw: unknown, maxLength: number): string {
  return typeof raw === 'string' ? raw.slice(0, maxLength) : '';
}

function sanitizeIcon(raw: unknown): HomepageIconKey {
  const value = typeof raw === 'string' ? raw : '';
  return HOMEPAGE_ICON_OPTIONS.some((opt) => opt.key === value)
    ? (value as HomepageIconKey)
    : 'sparkles';
}

function sanitizeImage(raw: unknown): HomepageImage {
  if (!raw || typeof raw !== 'object') return { src: '', alt: '' };
  const obj = raw as Record<string, unknown>;
  return {
    src: sanitizeImageRef(obj.src),
    alt: sanitizeText(obj.alt, 200),
  };
}

function sanitizeTags(raw: unknown, maxItems = 20): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    const value = sanitizeText(entry, 60).trim();
    if (value) out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitizeItems(raw: unknown): HomepageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((entry, index) => {
    const obj = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    return {
      id: sanitizeText(obj.id, 80) || `item_${index}`,
      title: sanitizeText(obj.title, 200),
      description: sanitizeText(obj.description, 600),
      label: sanitizeText(obj.label, 40),
      icon: sanitizeIcon(obj.icon),
      image: sanitizeImage(obj.image),
      tags: sanitizeTags(obj.tags),
    };
  });
}

function sanitizeSection(raw: unknown, fallback: HomepageSection): HomepageSection {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    id: fallback.id,
    kind: fallback.kind,
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : fallback.enabled,
    badge: sanitizeText(obj.badge, 120),
    eyebrow: sanitizeText(obj.eyebrow, 120),
    title: sanitizeText(obj.title, 300),
    accent: sanitizeText(obj.accent, 300),
    description: sanitizeText(obj.description, 900),
    note: sanitizeText(obj.note, 400),
    ctaLabel: sanitizeText(obj.ctaLabel, 80),
    ctaSecondaryLabel: sanitizeText(obj.ctaSecondaryLabel, 80),
    secondaryTitle: sanitizeText(obj.secondaryTitle, 200),
    secondaryText: sanitizeText(obj.secondaryText, 600),
    beforeLabel: sanitizeText(obj.beforeLabel, 60),
    afterLabel: sanitizeText(obj.afterLabel, 60),
    tags: sanitizeTags(obj.tags),
    image: sanitizeImage(obj.image),
    items: sanitizeItems(obj.items),
  };
}

export function collectHomepageMediaIds(content: HomepageContent): string[] {
  const ids = new Set<string>();
  const push = (src: string) => {
    const id = mediaIdFromRef(src);
    if (id) ids.add(id);
  };
  for (const section of content.sections) {
    push(section.image.src);
    for (const item of section.items) push(item.image.src);
  }
  return Array.from(ids);
}

function img(src = '', alt = ''): HomepageImage {
  return { src, alt };
}

function item(
  id: string,
  title: string,
  description: string,
  icon: HomepageIconKey,
  extra: Partial<HomepageItem> = {}
): HomepageItem {
  return {
    id,
    title,
    description,
    label: '',
    icon,
    image: img(),
    tags: [],
    ...extra,
  };
}

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  version: 1,
  sections: [
    {
      id: 'hero',
      kind: 'hero',
      enabled: true,
      badge: 'Your personal knowledge library',
      eyebrow: '',
      title: 'Save it now.',
      accent: 'Find it when you need it.',
      description:
        'Videos, screenshots, links, AI chats, and useful information are easy to save — and easy to forget. Zotomic keeps them organized, understands what they contain, and helps you find them again.',
      note: 'Save your first item. No complicated setup.',
      ctaLabel: 'Start saving for free',
      ctaSecondaryLabel: 'See how it works',
      secondaryTitle: '',
      secondaryText: '',
      tags: [],
      image: img(),
      items: [
        item('hero_1', 'Videos worth watching later', '', 'video'),
        item('hero_2', 'Screenshots worth remembering', '', 'image'),
        item('hero_3', 'Links worth keeping', '', 'link'),
        item('hero_4', 'Ideas worth finding again', '', 'brain'),
      ],
    },
    {
      id: 'problem',
      kind: 'problem',
      enabled: true,
      badge: '',
      eyebrow: 'The problem',
      title: 'Sound familiar?',
      accent: '',
      description: 'You save things every day. The hard part starts when you need them again.',
      note:
        "You don't need another place to dump things. You need a place that helps you find them again.",
      ctaLabel: '',
      ctaSecondaryLabel: '',
      secondaryTitle: '',
      secondaryText: '',
      tags: [],
      image: img(),
      items: [
        item(
          'problem_1',
          "I sent it to myself. I'll watch it later.",
          'Days later, dozens of videos are waiting. Which one was important?',
          'share',
          { tags: ['Shared Reel', 'Sent to myself', 'Watch later'] }
        ),
        item(
          'problem_2',
          "I took a screenshot so I wouldn't forget.",
          'Now you have hundreds of screenshots, but no idea which one contains that information.',
          'image',
          { tags: ['IMG_20261123_0134.jpg', 'IMG_20261124_2201.png', 'Screenshot (482).png'] }
        ),
        item(
          'problem_3',
          'I know I saw that website somewhere.',
          'You remember the idea — but not the link, title, or location.',
          'globe',
          { tags: ['That tool from last week', 'A tab I closed', 'Some bookmark'] }
        ),
      ],
    },
    {
      id: 'steps',
      kind: 'steps',
      enabled: true,
      badge: '',
      eyebrow: 'How it works',
      title: 'From saved content to searchable knowledge',
      accent: '',
      description: 'Three simple steps. No folders to maintain, no system to learn.',
      note: '',
      ctaLabel: 'Start with your first save',
      ctaSecondaryLabel: '',
      secondaryTitle: '',
      secondaryText: '',
      tags: [],
      image: img(),
      items: [
        item(
          'step_1',
          'Save anything',
          'Share a video, screenshot, link, document, or AI conversation with Zotomic.',
          'share',
          { label: '01' }
        ),
        item(
          'step_2',
          'Zotomic organizes it',
          'AI extracts useful information, creates summaries, identifies topics, and helps organize what you saved.',
          'sparkles',
          { label: '02' }
        ),
        item(
          'step_3',
          'Find it anytime',
          'Search for a topic, keyword, idea, or information you remember. Find your saved content without digging through chats and galleries.',
          'search',
          { label: '03' }
        ),
      ],
    },
    {
      id: 'content-types',
      kind: 'content-types',
      enabled: true,
      badge: '',
      eyebrow: 'What you can save',
      title: 'Everything you want to remember, in one place.',
      accent: '',
      description: 'One library for the things you save across apps, browsers, and devices.',
      note: '',
      ctaLabel: '',
      ctaSecondaryLabel: '',
      secondaryTitle: '',
      secondaryText: '',
      tags: [],
      image: img(),
      items: [
        item('content_1', 'Videos', 'Save videos and find specific topics or moments later.', 'video'),
        item(
          'content_2',
          'Screenshots',
          'Keep useful information, images, and visual references searchable.',
          'image'
        ),
        item(
          'content_3',
          'Websites & links',
          'Save tools, products, websites, and resources worth revisiting.',
          'globe'
        ),
        item(
          'content_4',
          'Documents & text',
          'Keep documents, notes, PDFs, and useful written information together.',
          'document'
        ),
        item(
          'content_5',
          'AI conversations',
          'Save useful answers, conversations, and AI-generated ideas.',
          'bot'
        ),
        item(
          'content_6',
          'Bookmarks',
          'Bring saved bookmarks into a searchable library.',
          'bookmark'
        ),
      ],
    },
    {
      id: 'transformation',
      kind: 'transformation',
      enabled: true,
      badge: '',
      eyebrow: 'The difference',
      title: 'Turn scattered saves into something useful.',
      accent: '',
      description:
        'Instead of a file name you forgot, keep an item you can actually understand and search.',
      note: 'Saved across galleries, chats, and browser history — hard to retrieve.',
      ctaLabel: '',
      ctaSecondaryLabel: '',
      secondaryTitle: 'AI automation tool',
      secondaryText: 'AI automation tool controlling Android phone',
      beforeLabel: 'Before',
      afterLabel: 'After',
      tags: ['ai', 'automation', 'mobile', 'developer-tools'],
      image: img(),
      items: [
        item('before_1', 'IMG_20261123_0134.jpg', '', 'image'),
        item('before_2', 'Shared Reel', '', 'video'),
        item('before_3', 'Website link', '', 'link'),
      ],
    },
    {
      id: 'search-demo',
      kind: 'search-demo',
      enabled: true,
      badge: '',
      eyebrow: 'Find it again',
      title: 'Find it using what you remember.',
      accent: '',
      description:
        'Search titles, notes, tags, summaries, transcript text, and extracted links. Use the words and topics you remember — not the folder you saved it in.',
      note: 'Tool mentioned in a video about controlling an Android phone with AI automation.',
      ctaLabel: '',
      ctaSecondaryLabel: '',
      secondaryTitle: 'AI automation tool',
      secondaryText: 'AI automation Android',
      tags: ['AI automation Android', 'SEO checklist', 'screenshot SEO'],
      image: img(),
      items: [],
    },
    {
      id: 'product-flow',
      kind: 'product-flow',
      enabled: true,
      badge: '',
      eyebrow: 'The flow',
      title: 'See Zotomic in action',
      accent: '',
      description:
        'A fast, repeatable loop: save it, let Zotomic organize it, then find it when you need it.',
      note: 'Start with one item. Your library grows with you.',
      ctaLabel: 'Open my library',
      ctaSecondaryLabel: '',
      secondaryTitle: 'Share → organize → find',
      secondaryText: 'One library, every device',
      tags: [],
      image: img(),
      items: [
        item('flow_1', 'Share a video', 'From any app share sheet', 'share', { label: '01' }),
        item('flow_2', 'Save a screenshot', 'From your gallery or clipboard', 'image', {
          label: '02',
        }),
        item(
          'flow_3',
          'AI processes it',
          'Summary, tags, links, key moments',
          'sparkles',
          { label: '03' }
        ),
        item('flow_4', 'Search & open', 'Find it by what you remember', 'search', {
          label: '04',
        }),
      ],
    },
    {
      id: 'features',
      kind: 'features',
      enabled: true,
      badge: '',
      eyebrow: 'Features',
      title: 'Your saved library, organized your way.',
      accent: '',
      description: 'The tools that keep your library useful after the save button.',
      note: '',
      ctaLabel: '',
      ctaSecondaryLabel: '',
      secondaryTitle: '',
      secondaryText: '',
      tags: [
        'Search',
        'Tags',
        'Summaries',
        'Extracted links',
        'Timestamps where available',
        'Favorites',
        'Collections',
        'Personal notes',
        'Reminders',
      ],
      image: img(),
      items: [],
    },
    {
      id: 'privacy',
      kind: 'privacy',
      enabled: true,
      badge: '',
      eyebrow: 'Privacy',
      title: 'Your content. Your library.',
      accent: '',
      description: 'Clear boundaries for where your content lives and how it gets processed.',
      note: '',
      ctaLabel: '',
      ctaSecondaryLabel: '',
      secondaryTitle: '',
      secondaryText: '',
      tags: [],
      image: img(),
      items: [
        item(
          'privacy_1',
          'Original uploads stay on your device',
          'For supported local uploads, original media is stored locally rather than retained as a permanent cloud media archive.',
          'harddrive'
        ),
        item(
          'privacy_2',
          'Your knowledge can sync',
          'Structured library data can be stored in your cloud account for access and synchronization.',
          'cloud'
        ),
        item(
          'privacy_3',
          'Clear processing transparency',
          'AI processing may send content to external AI providers so it can be analyzed. Your library stays under your account.',
          'lock'
        ),
      ],
    },
    {
      id: 'cta',
      kind: 'cta',
      enabled: true,
      badge: '',
      eyebrow: '',
      title: 'Start building your personal knowledge library.',
      accent: '',
      description:
        "Save the things you don't want to lose — and find them when you need them.",
      note: '',
      ctaLabel: 'Start saving for free',
      ctaSecondaryLabel: 'I already have an account',
      secondaryTitle: '',
      secondaryText: '',
      tags: [],
      image: img(),
      items: [],
    },
  ],
};

/**
 * Normalizes stored homepage content against the default structure. Missing
 * sections fall back to defaults, but a section that exists keeps its own list
 * of items (so admins can delete items).
 */
export function sanitizeHomepageContent(raw: unknown): HomepageContent {
  if (!raw || typeof raw !== 'object') return DEFAULT_HOMEPAGE_CONTENT;
  const obj = raw as Record<string, unknown>;
  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  const byId = new Map<string, unknown>();
  for (const entry of rawSections) {
    if (entry && typeof entry === 'object') {
      const id = (entry as Record<string, unknown>).id;
      if (typeof id === 'string') byId.set(id, entry);
    }
  }
  return {
    version: 1,
    sections: DEFAULT_HOMEPAGE_CONTENT.sections.map((fallback) =>
      byId.has(fallback.id) ? sanitizeSection(byId.get(fallback.id), fallback) : fallback
    ),
  };
}
