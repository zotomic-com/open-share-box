export type InboxItemType = 'video' | 'screenshot' | 'link' | 'document' | 'ai-chat';

export type VideoPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'vimeo'
  | 'x'
  | 'web'
  | 'screenshot'
  | 'upload'
  | 'document'
  | 'pdf'
  | 'chatgpt'
  | 'gemini'
  | 'claude'
  | 'llm'
  | 'other';

export interface VideoSegment {
  timestamp: string;
  seconds: number;
  title: string;
  summary: string;
  keyQuote?: string;
}

export interface TranscriptEntry {
  timestamp: string;
  seconds: number;
  speaker?: string;
  text: string;
}

export interface ExtractedLink {
  url: string;
  label: string;
  kind?: 'product' | 'service' | 'resource' | 'social' | 'other';
  context?: string;
}

export interface AnalyzedVideo {
  id: string;
  ownerId: string;
  itemType?: InboxItemType;
  url: string;
  platform: VideoPlatform;
  title: string;
  creator: string;
  thumbnailUrl: string;
  durationLabel: string;
  category: string;
  collectionId: string;
  isFavorite: boolean;
  saveReason?: string;
  localMediaId?: string;
  summary: string;
  tldrBullets: string[];
  tags: string[];
  segments: VideoSegment[];
  transcript: TranscriptEntry[];
  links?: ExtractedLink[];
  notes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface VideoCollection {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AnalyzeVideoResponse {
  itemType?: InboxItemType;
  url: string;
  platform: VideoPlatform;
  title: string;
  creator: string;
  thumbnailUrl: string;
  durationLabel: string;
  category: string;
  summary: string;
  tldrBullets: string[];
  tags: string[];
  segments: VideoSegment[];
  transcript: TranscriptEntry[];
  links?: ExtractedLink[];
  metadataSource: string;
}

export interface VideoChatMessage {
  role: 'user' | 'model';
  text: string;
}

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'pending';

export type UserBadgeColor = 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate';

export interface UserBadge {
  id: string;
  name: string;
  description: string;
  color: UserBadgeColor;
  icon: string;
  updatedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserBadgeInput {
  id?: string;
  name: string;
  description: string;
  color: UserBadgeColor;
  icon: string;
}

export type UserPlanStatus = 'none' | 'active' | 'due' | 'expired';

export interface UserProfileRecord {
  uid: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  status: UserStatus;
  bio: string;
  organization: string;
  location: string;
  videoCount: number;
  badgeIds: string[];
  activePlanId?: string;
  planStatus?: UserPlanStatus;
  planExpiresAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserPrivateRecord {
  uid: string;
  email: string;
  phone: string;
  address: string;
  adminNotes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FullUserRecord {
  profile: UserProfileRecord;
  privateInfo: UserPrivateRecord | null;
}

export interface PricingPlan {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyMonthlyPrice: number;
  highlighted: boolean;
  badge: string;
  autoBadgeId?: string;
  ctaLabel: string;
  features: string[];
  sortOrder: number;
  updatedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PricingPlanInput {
  id?: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyMonthlyPrice: number;
  highlighted: boolean;
  badge: string;
  autoBadgeId?: string;
  ctaLabel: string;
  features: string[];
  sortOrder: number;
}

export type PageBlockType = 'heading' | 'text' | 'image' | 'video';
export type PageType = 'legal' | 'guide' | 'custom';

export interface PageBlock {
  id: string;
  type: PageBlockType;
  heading?: string;
  content?: string;
  mediaUrl?: string;
  caption?: string;
}

export interface SitePage {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  pageType: PageType;
  isPublished: boolean;
  blocks: PageBlock[];
  updatedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AiBrainDepth = 'fast' | 'balanced';

export interface AiBrainSettings {
  depth: AiBrainDepth;
  language: string;
  customInstruction: string;
}

export type NavLinkActionType = 'view' | 'page' | 'url' | 'anchor';

export interface NavLinkItem {
  id: string;
  label: string;
  actionType: NavLinkActionType;
  target: string;
  visible: boolean;
  sortOrder: number;
  openInNewTab?: boolean;
}

export interface CheckoutFieldConfig {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
  visible: boolean;
}

export type HomepageIconKey =
  | 'video'
  | 'image'
  | 'link'
  | 'document'
  | 'bot'
  | 'bookmark'
  | 'brain'
  | 'share'
  | 'sparkles'
  | 'search'
  | 'shield'
  | 'lock'
  | 'cloud'
  | 'harddrive'
  | 'globe'
  | 'clock'
  | 'layers'
  | 'check'
  | 'play'
  | 'arrow';

/** Image source can be a public https URL, an empty string, or a `media:<id>` reference. */
export interface HomepageImage {
  src: string;
  alt: string;
}

export interface HomepageItem {
  id: string;
  title: string;
  description: string;
  label: string;
  icon: HomepageIconKey;
  image: HomepageImage;
  tags: string[];
}

export type HomepageSectionKind =
  | 'hero'
  | 'problem'
  | 'steps'
  | 'content-types'
  | 'transformation'
  | 'search-demo'
  | 'product-flow'
  | 'features'
  | 'privacy'
  | 'cta';

export interface HomepageSection {
  id: HomepageSectionKind;
  kind: HomepageSectionKind;
  enabled: boolean;
  badge: string;
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  note: string;
  ctaLabel: string;
  ctaSecondaryLabel: string;
  secondaryTitle: string;
  secondaryText: string;
  beforeLabel?: string;
  afterLabel?: string;
  tags: string[];
  image: HomepageImage;
  items: HomepageItem[];
}

export interface HomepageContent {
  version: number;
  sections: HomepageSection[];
}

export interface SiteSettings {
  id: 'site';
  siteName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  appleTouchIconUrl: string;
  pwaIcon192Url: string;
  pwaIcon512Url: string;
  pwaMaskableIconUrl: string;
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string;
  canonicalUrl: string;
  googleSiteVerification: string;
  googleHtmlFileName: string;
  googleHtmlFileContent: string;
  aiDefaultDepth: AiBrainDepth;
  aiDefaultLanguage: string;
  aiCustomInstruction: string;
  socialLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
  facebookAppId: string;
  pricingEnabled: boolean;
  headerLinks: NavLinkItem[];
  footerLinks: NavLinkItem[];
  footerText: string;
  checkoutEnabled: boolean;
  checkoutTitle: string;
  checkoutSubtitle: string;
  checkoutCurrency: string;
  checkoutTaxPercent: number;
  checkoutNotice: string;
  checkoutCustomFields: CheckoutFieldConfig[];
  updatedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type NotificationAudience = 'user' | 'admin' | 'all';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'billing';

export interface SiteNotification {
  id: string;
  audience: NotificationAudience;
  targetUid: string;
  title: string;
  message: string;
  type: NotificationSeverity;
  linkLabel?: string;
  linkTarget?: string;
  isActive: boolean;
  updatedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SiteNotificationInput {
  id?: string;
  audience: NotificationAudience;
  targetUid: string;
  title: string;
  message: string;
  type: NotificationSeverity;
  linkLabel?: string;
  linkTarget?: string;
  isActive: boolean;
}

export type PaymentGatewayType = 'stripe' | 'bank' | 'bkash' | 'nagad' | 'crypto' | 'custom';

export interface PaymentGateway {
  id: string;
  name: string;
  gatewayType: PaymentGatewayType;
  enabled: boolean;
  accountLabel: string;
  accountValue: string;
  instructions: string;
  badgeText: string;
  sortOrder: number;
  updatedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PaymentGatewayInput {
  id?: string;
  name: string;
  gatewayType: PaymentGatewayType;
  enabled: boolean;
  accountLabel: string;
  accountValue: string;
  instructions: string;
  badgeText: string;
  sortOrder: number;
}

export type InvoiceStatus = 'paid' | 'due' | 'pending' | 'expired' | 'cancelled';
export type InvoiceBillingCycle = 'monthly' | 'yearly' | 'one-time';

export interface InvoiceCustomFieldEntry {
  label: string;
  value: string;
}

export interface BillingInvoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  billingCycle: InvoiceBillingCycle;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  gatewayId: string;
  gatewayName: string;
  transactionRef: string;
  payerAccount: string;
  customFields: InvoiceCustomFieldEntry[];
  status: InvoiceStatus;
  notes: string;
  dueAtMs: number;
  paidAtMs: number;
  expiresAtMs: number;
  updatedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type FeatureModuleKey =
  | 'text-pdf'
  | 'bookmark-share'
  | 'llm-chat'
  | 'reminders'
  | 'whatsapp'
  | 'custom';

export interface FeatureModuleConfig {
  id: string;
  key: FeatureModuleKey;
  name: string;
  description: string;
  isActive: boolean;
  isVisible: boolean;
  sortOrder: number;
  badgeText: string;
  helperNote: string;
  maxSizeMb: number;
  updatedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FeatureModuleInput {
  id?: string;
  key: FeatureModuleKey;
  name: string;
  description: string;
  isActive: boolean;
  isVisible: boolean;
  sortOrder: number;
  badgeText: string;
  helperNote: string;
  maxSizeMb: number;
}

export type ReminderRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type ReminderStatus = 'active' | 'completed' | 'dismissed';
export type ReminderChannel = 'in-app' | 'whatsapp' | 'both';

export interface UserReminder {
  id: string;
  ownerId: string;
  title: string;
  note: string;
  videoId?: string;
  videoTitle?: string;
  dueAtMs: number;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  channel: ReminderChannel;
  lastSentAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserReminderInput {
  id?: string;
  title: string;
  note: string;
  videoId?: string;
  videoTitle?: string;
  dueAtMs: number;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  channel: ReminderChannel;
}

export interface WhatsAppConfig {
  uid: string;
  enabled: boolean;
  phoneNumber: string;
  displayLabel: string;
  autoIncludeItemLink: boolean;
  deliveryMode: 'wa-link' | 'cloud-api';
  lastTestedAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface WhatsAppConfigInput {
  enabled: boolean;
  phoneNumber: string;
  displayLabel: string;
  autoIncludeItemLink: boolean;
  deliveryMode: 'wa-link' | 'cloud-api';
}

export interface ParsedBookmarkEntry {
  id: string;
  title: string;
  url: string;
  folder: string;
  addedAtMs?: number;
}
