import type { AnalyzedVideo, InboxItemType, VideoPlatform } from '../types/video';

export const PLATFORM_LABELS: Record<VideoPlatform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  vimeo: 'Vimeo',
  x: 'X / Twitter',
  web: 'Web / Product Link',
  screenshot: 'Screenshot',
  upload: 'Local Clip',
  document: 'Text / Note',
  pdf: 'PDF Document',
  chatgpt: 'ChatGPT Share',
  gemini: 'Gemini Share',
  claude: 'Claude Share',
  llm: 'AI Chat Share',
  other: 'Shared Link',
};

export const SAVE_REASON_PRESETS: string[] = [
  'Watch & Learn',
  'Buy Later',
  'Product / Tool',
  'Service / Vendor',
  'Keyword Reference',
  'Inspiration',
  'Work / Research',
];

export function getItemType(item: Pick<AnalyzedVideo, 'itemType' | 'platform'>): InboxItemType {
  if (
    item.itemType === 'video' ||
    item.itemType === 'screenshot' ||
    item.itemType === 'link' ||
    item.itemType === 'document' ||
    item.itemType === 'ai-chat'
  ) {
    return item.itemType;
  }
  if (item.platform === 'screenshot') return 'screenshot';
  if (item.platform === 'document' || item.platform === 'pdf') return 'document';
  if (
    item.platform === 'chatgpt' ||
    item.platform === 'gemini' ||
    item.platform === 'claude' ||
    item.platform === 'llm'
  ) {
    return 'ai-chat';
  }
  if (item.platform === 'web') return 'link';
  return 'video';
}

export function generateSafeId(prefix = 'vid'): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function extractUrlFromShareParams(params: URLSearchParams): {
  url: string;
  title: string;
  text: string;
} {
  const rawUrl = params.get('url') || '';
  const rawText = params.get('text') || '';
  const rawTitle = params.get('title') || '';

  const combined = `${rawUrl} ${rawText}`.trim();
  const match = combined.match(/https?:\/\/[^\s<>"'`]+/i);
  const extractedUrl = match ? match[0].replace(/[),.;!?]+$/, '') : '';

  return {
    url: extractedUrl,
    title: rawTitle.trim(),
    text: rawText.trim(),
  };
}

export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (parsed.pathname.includes('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    }
    if (parsed.pathname.includes('/embed/')) {
      return parsed.pathname.split('/embed/')[1]?.split('/')[0] || null;
    }
    if (parsed.pathname.includes('/live/')) {
      return parsed.pathname.split('/live/')[1]?.split('/')[0] || null;
    }
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

export function extractVimeoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('vimeo.com')) return null;
    const match = parsed.pathname.match(/\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function formatMarkdownExport(video: AnalyzedVideo): string {
  const lines: string[] = [
    `# ${video.title}`,
    `**Platform:** ${PLATFORM_LABELS[video.platform]} · **Creator / Source:** ${video.creator} · **Duration:** ${video.durationLabel}`,
    `**Source:** ${video.url}`,
    video.saveReason ? `**Why Saved:** ${video.saveReason}` : '',
    video.tags.length ? `**Tags:** ${video.tags.map((t) => `#${t}`).join(' ')}` : '',
    '',
    '## Summary',
    video.summary,
    '',
  ];

  if (video.tldrBullets.length > 0) {
    lines.push('## Key Takeaways');
    for (const bullet of video.tldrBullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push('');
  }

  if (video.links && video.links.length > 0) {
    lines.push('## Retrieved Links');
    for (const link of video.links) {
      lines.push(`- [${link.label || link.url}](${link.url})${link.context ? ` — ${link.context}` : ''}`);
    }
    lines.push('');
  }

  if (video.segments.length > 0) {
    lines.push('## Segments');
    for (const seg of video.segments) {
      lines.push(`- **${seg.timestamp} — ${seg.title}**: ${seg.summary}`);
      if (seg.keyQuote) {
        lines.push(`  > "${seg.keyQuote}"`);
      }
    }
    lines.push('');
  }

  if (video.notes.trim()) {
    lines.push('## Personal Notes');
    lines.push(video.notes.trim());
    lines.push('');
  }

  if (video.transcript.length > 0) {
    lines.push('## Transcript / Extracted Text');
    for (const entry of video.transcript) {
      lines.push(`[${entry.timestamp}] **${entry.speaker || 'Speaker'}:** ${entry.text}`);
    }
  }

  return lines.filter((l) => l !== undefined && l !== '').join('\n');
}

export function formatChaptersExport(video: AnalyzedVideo): string {
  return video.segments.map((s) => `${s.timestamp} ${s.title}`).join('\n');
}

export function formatRelativeDate(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
