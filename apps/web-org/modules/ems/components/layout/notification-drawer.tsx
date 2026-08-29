'use client';

import React, { useState } from 'react';
import { useAuth } from '../../hooks/use-auth';

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  category: 'APPROVAL' | 'ATTENDANCE' | 'TIMESHEET' | 'ANNOUNCEMENT';
  isRead: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Timesheet Approved',
    description: 'Your timesheet (Aug 18 - Aug 24) has been approved by your manager.',
    time: '5 mins ago',
    category: 'TIMESHEET',
    isRead: false,
  },
  {
    id: 'notif-2',
    title: 'Leave Request Approved',
    description: 'Your casual leave application for Aug 28, 2026 was signed off.',
    time: '2 hours ago',
    category: 'APPROVAL',
    isRead: false,
  },
  {
    id: 'notif-3',
    title: 'New Policy Announcement',
    description:
      'Organization published updated Q3 Hybrid Work & Biometric Verification guidelines.',
    time: '1 day ago',
    category: 'ANNOUNCEMENT',
    isRead: true,
  },
  {
    id: 'notif-4',
    title: 'Shift Timetable Scheduled',
    description: 'General Day Shift (09:30 AM - 06:30 PM) rostered for upcoming cycle.',
    time: '2 days ago',
    category: 'ATTENDANCE',
    isRead: true,
  },
];

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const { persona } = useAuth();
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.isRead;
    return true;
  });

  const getCategoryIcon = (cat: NotificationItem['category']) => {
    switch (cat) {
      case 'APPROVAL':
        return <span className="text-emerald-500">✓</span>;
      case 'TIMESHEET':
        return <span className="text-sky-500">⏱</span>;
      case 'ANNOUNCEMENT':
        return <span className="text-amber-500">📢</span>;
      case 'ATTENDANCE':
        return <span className="text-indigo-500">📅</span>;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex justify-end animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col z-50 overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-sm font-bold text-slate-900 !m-0">Notifications</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Activity & updates for {persona.name.split(' ')[0]}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-semibold text-[#0284C7] hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors cursor-pointer"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter Tab Strip */}
        <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-white">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
              filter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('UNREAD')}
            className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer flex items-center gap-1.5 ${
              filter === 'UNREAD' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="h-4 w-4 rounded-full bg-sky-500 text-white text-[10px] flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No notifications to display.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-[6px] border transition-all flex items-start gap-3 shadow-xs ${
                  item.isRead
                    ? 'bg-white border-slate-200/80 text-slate-600'
                    : 'bg-sky-50/40 border-sky-200 text-slate-900'
                }`}
              >
                <div className="h-7 w-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs text-sm">
                  {getCategoryIcon(item.category)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold truncate">{item.title}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{item.time}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
