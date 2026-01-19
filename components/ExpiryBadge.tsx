
import React from 'react';

interface ExpiryBadgeProps {
  date: string;
}

const ExpiryBadge: React.FC<ExpiryBadgeProps> = ({ date }) => {
  // Parse date string (YYYY-MM-DD) carefully to avoid timezone shifts
  const [year, month, day] = date.split('-').map(Number);
  const expiryDate = new Date(year, month - 1, day);
  expiryDate.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = expiryDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  let colorClass = 'bg-green-100 text-green-800 border-green-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
  let text = `${diffDays} days left`;

  if (diffDays < 0) {
    colorClass = 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600';
    text = 'Expired';
  } else if (diffDays === 0) {
    colorClass = 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
    text = 'Expires Today';
  } else if (diffDays <= 3) {
    colorClass = 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
    text = `${diffDays} days left`;
  } else if (diffDays <= 7) {
    colorClass = 'bg-yellow-50 text-yellow-800 border-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
    text = `${diffDays} days left`;
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${colorClass}`}>
      {text}
    </span>
  );
};

export default ExpiryBadge;
