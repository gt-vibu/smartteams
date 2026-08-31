'use client';

import { Button, Checkbox, Input, Textarea } from '@smarteam/ui';

import React, { useState } from 'react';
import { Select } from '@smarteam/ui';
import type { AnnouncementData } from '../../types/organization.types';
import { useAuth } from '../../hooks/use-auth';

interface OrgAnnouncementsTabProps {
  announcements: AnnouncementData[];
  onAddAnnouncement?: (
    announcement: Omit<AnnouncementData, 'id' | 'likes' | 'commentsCount'>,
  ) => void;
}

export function OrgAnnouncementsTab({
  announcements,
  onAddAnnouncement,
}: OrgAnnouncementsTabProps) {
  const { hasPermission } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'ALL_HANDS' | 'POLICY' | 'EVENT' | 'SECURITY'>(
    'ALL_HANDS',
  );
  const [isPinned, setIsPinned] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

  const categories = [
    { id: 'ALL', label: 'All Notices' },
    { id: 'ALL_HANDS', label: 'All-Hands & Townhalls' },
    { id: 'POLICY', label: 'Policies & Updates' },
    { id: 'SECURITY', label: 'Security & Compliance' },
    { id: 'EVENT', label: 'Workplace Events' },
  ];

  const filteredAnnouncements = announcements.filter((a) => {
    if (selectedCategory === 'ALL') return true;
    return a.category === selectedCategory;
  });

  const handleLike = (id: string) => {
    setLikedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim() && newContent.trim()) {
      onAddAnnouncement?.({
        title: newTitle.trim(),
        content: newContent.trim(),
        author: 'Mithun Gowda H',
        role: 'Software Engineer',
        avatarInitials: 'MG',
        date: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        category: newCategory,
        isPinned,
      });
      setNewTitle('');
      setNewContent('');
      setIsPinned(false);
      setIsCreateModalOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Category Filter Strip + New Announcement Button */}
      <div className="bg-white rounded-[6px] border border-slate-200 p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <Button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-[4px] transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-primary text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {cat.label}
              </Button>
            );
          })}
        </div>

        {hasPermission('organizations.write') && (
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-[4px] shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <span>+</span>
            <span>New Announcement</span>
          </Button>
        )}
      </div>

      {/* Announcements Stream */}
      <div className="space-y-3">
        {filteredAnnouncements.length === 0 ? (
          <div className="bg-white rounded-[6px] border border-slate-200 p-12 text-center shadow-xs">
            <div className="text-2xl mb-2">📢</div>
            <div className="text-sm font-bold text-slate-700">No Announcements Found</div>
            <p className="text-xs text-slate-500 mt-1">
              There are no announcements posted in this category.
            </p>
          </div>
        ) : (
          filteredAnnouncements.map((ann) => {
            const isLiked = !!likedMap[ann.id];
            const likeCount = ann.likes + (isLiked ? 1 : 0);

            return (
              <div
                key={ann.id}
                className="bg-white rounded-[6px] border border-slate-200/90 p-5 shadow-xs space-y-3"
              >
                {/* Announcement Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                      {ann.avatarInitials}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{ann.author}</span>
                        {ann.isPinned && (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded uppercase">
                            Pinned
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {ann.role} · {ann.date}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      ann.category === 'SECURITY'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : ann.category === 'POLICY'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : ann.category === 'ALL_HANDS'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {ann.category.replace('_', ' ')}
                  </span>
                </div>

                {/* Title & Body */}
                <div>
                  <h3 className="text-xs font-bold text-slate-900 mb-1.5">{ann.title}</h3>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {ann.content}
                  </p>
                </div>

                {/* Action Bar */}
                <div className="flex items-center gap-4 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
                  <Button
                    onClick={() => handleLike(ann.id)}
                    className={`flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                      isLiked ? 'text-sky-600 font-bold' : 'hover:text-slate-800'
                    }`}
                  >
                    <svg
                      className="h-4 w-4"
                      fill={isLiked ? 'currentColor' : 'none'}
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                      />
                    </svg>
                    <span>{likeCount} Likes</span>
                  </Button>

                  <div className="flex items-center gap-1.5 font-medium hover:text-slate-800 cursor-pointer">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    <span>{ann.commentsCount} Comments</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Announcement Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-[8px] max-w-lg w-full p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Post Organization Announcement
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Broadcast a company notice, milestone update, or policy notice to all employees.
            </p>
            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Title</label>
                <Input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Q3 Townhall Schedule & Agenda"
                  className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Category</label>
                <Select
                  value={newCategory}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (
                      value === 'ALL_HANDS' ||
                      value === 'POLICY' ||
                      value === 'EVENT' ||
                      value === 'SECURITY'
                    ) {
                      setNewCategory(value);
                    }
                  }}
                >
                  <option value="ALL_HANDS">All-Hands & Townhalls</option>
                  <option value="POLICY">Policies & Updates</option>
                  <option value="SECURITY">Security & Compliance</option>
                  <option value="EVENT">Workplace Events</option>
                </Select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Content</label>
                <Textarea
                  required
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write announcement details here..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="pinNotice"
                  checked={isPinned}
                  onCheckedChange={setIsPinned}
                  aria-label="Pin this announcement to the top"
                  className="h-3.5 w-3.5"
                />
                <label
                  htmlFor="pinNotice"
                  className="text-xs text-slate-700 font-medium cursor-pointer"
                >
                  Pin this announcement to the top
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded font-medium cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-primary hover:bg-primary/90 text-white rounded font-semibold transition-colors cursor-pointer"
                >
                  Publish Announcement
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
