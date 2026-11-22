import type { SitePage } from '../types/video';
import { extractVimeoId, extractYouTubeId } from './videoUtils';

export function sanitizeHttpUrl(raw: string | undefined): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function getEmbeddableVideoInfo(rawUrl: string): {
  kind: 'youtube' | 'vimeo' | 'direct' | 'link';
  src: string;
} {
  const safe = sanitizeHttpUrl(rawUrl);
  if (!safe) return { kind: 'link', src: '' };

  const ytId = extractYouTubeId(safe);
  if (ytId) {
    return { kind: 'youtube', src: `https://www.youtube.com/embed/${ytId}?rel=0` };
  }
  const vimeoId = extractVimeoId(safe);
  if (vimeoId) {
    return { kind: 'vimeo', src: `https://player.vimeo.com/video/${vimeoId}` };
  }
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(safe)) {
    return { kind: 'direct', src: safe };
  }
  return { kind: 'link', src: safe };
}

export const DEFAULT_SITE_PAGES: SitePage[] = [
  {
    id: 'terms-of-service',
    slug: 'terms-of-service',
    title: 'Terms of Service',
    subtitle: 'Usage guidelines, content ownership, and service terms for ClipIndex.',
    pageType: 'legal',
    isPublished: true,
    updatedBy: 'system',
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    blocks: [
      {
        id: 'tos_1',
        type: 'heading',
        heading: '1. Acceptance of Terms',
      },
      {
        id: 'tos_2',
        type: 'text',
        content:
          'By accessing or using ClipIndex, you agree to be bound by these Terms of Service and all applicable laws. If you are using the workspace on behalf of an organization, you represent that you have the authority to accept these terms on its behalf.',
      },
      {
        id: 'tos_3',
        type: 'heading',
        heading: '2. Video Links, Transcripts & Intellectual Property',
      },
      {
        id: 'tos_4',
        type: 'text',
        content:
          'You retain full ownership of your personal notes, collections, tags, and uploaded video clips. Summaries, timestamps, and transcripts generated from third-party public video links are intended strictly for personal research, study, and organization.',
      },
      {
        id: 'tos_5',
        type: 'heading',
        heading: '3. Acceptable Use & Account Security',
      },
      {
        id: 'tos_6',
        type: 'text',
        content:
          'You are responsible for safeguarding your account credentials and ensuring that shared URLs and uploaded clips comply with applicable copyright and platform guidelines. Accounts found engaging in automated abuse or unauthorized scraping may be suspended by administrators.',
      },
    ],
  },
  {
    id: 'privacy-policy',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    subtitle: 'How ClipIndex collects, protects, and isolates your account and video library data.',
    pageType: 'legal',
    isPublished: true,
    updatedBy: 'system',
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    blocks: [
      {
        id: 'pp_1',
        type: 'heading',
        heading: '1. Information We Collect',
      },
      {
        id: 'pp_2',
        type: 'text',
        content:
          'When you create an account, we store your display name, account status, and role alongside isolated contact details (such as your verified email address, optional phone number, and optional address) inside owner-restricted storage.',
      },
      {
        id: 'pp_3',
        type: 'heading',
        heading: '2. Video Processing & Library Storage',
      },
      {
        id: 'pp_4',
        type: 'text',
        content:
          'Shared video links and uploaded clips submitted for timestamp extraction are processed through our server-side AI pipeline solely to generate your requested segments, summaries, transcripts, and searchable tags. Your library items remain private to your account.',
      },
      {
        id: 'pp_5',
        type: 'heading',
        heading: '3. Data Protection & Your Controls',
      },
      {
        id: 'pp_6',
        type: 'text',
        content:
          'You may update your profile information, export your video summaries in Markdown, or delete saved videos and collections from your workspace at any time. For account removal requests, contact an administrator.',
      },
    ],
  },
];
