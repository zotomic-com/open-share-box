import React from 'react';
import { Award, CheckCircle2, Crown, ShieldCheck, Star, Zap } from 'lucide-react';
import type { UserBadge, UserBadgeColor } from '../types/video';

interface BadgePillProps {
  badge: Pick<UserBadge, 'name' | 'description' | 'color' | 'icon'>;
  size?: 'sm' | 'md';
}

const COLOR_STYLES: Record<UserBadgeColor, string> = {
  blue: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800',
  emerald:
    'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
  amber:
    'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
  violet:
    'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-200 dark:border-violet-800',
  rose: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
  slate:
    'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
};

function renderBadgeIcon(icon: string, className: string) {
  switch ((icon || '').toLowerCase()) {
    case 'shield':
      return <ShieldCheck className={className} aria-hidden="true" />;
    case 'star':
      return <Star className={className} aria-hidden="true" />;
    case 'zap':
      return <Zap className={className} aria-hidden="true" />;
    case 'crown':
      return <Crown className={className} aria-hidden="true" />;
    case 'check':
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case 'award':
    default:
      return <Award className={className} aria-hidden="true" />;
  }
}

export const BadgePill: React.FC<BadgePillProps> = ({ badge, size = 'md' }) => {
  const colorStyle = COLOR_STYLES[badge.color] || COLOR_STYLES.blue;
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      title={badge.description || badge.name}
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border ${paddingClass} ${colorStyle}`}
    >
      {renderBadgeIcon(badge.icon, `${iconSize} shrink-0`)}
      <span>{badge.name}</span>
    </span>
  );
};
