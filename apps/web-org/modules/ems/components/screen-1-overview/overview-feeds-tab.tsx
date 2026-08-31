'use client';

import { Button, Textarea } from '@smarteam/ui';

import React, { useState } from 'react';

interface FeedPost {
  id: string;
  author: string;
  avatar: string;
  role: string;
  time: string;
  type: 'ANNOUNCEMENT' | 'KUDOS' | 'EVENT';
  content: string;
  likes: number;
  commentsCount: number;
  hasLiked?: boolean;
}

export function OverviewFeedsTab() {
  const [posts, setPosts] = useState<FeedPost[]>([
    {
      id: 'post-1',
      author: 'Priya Sharma',
      avatar: 'PS',
      role: 'VP of Engineering',
      time: '2 hours ago',
      type: 'ANNOUNCEMENT',
      content:
        '🚀 Great news team! The Q3 Product Release has officially reached 100% test coverage. Kudos to the entire Smarteam Engineering squad for the relentless hard work!',
      likes: 18,
      commentsCount: 4,
    },
    {
      id: 'post-2',
      author: 'Ranjith Kumar C',
      avatar: 'RK',
      role: 'Engineering Manager',
      time: 'Yesterday at 4:30 PM',
      type: 'KUDOS',
      content:
        '⭐ Huge shoutout to Mithun Gowda H for quickly diagnosing and resolving the attendance clock sync bottleneck. Excellent ownership!',
      likes: 12,
      commentsCount: 2,
    },
    {
      id: 'post-3',
      author: 'People & Culture Team',
      avatar: 'PC',
      role: 'HR Operations',
      time: '2 days ago',
      type: 'EVENT',
      content:
        '🎉 Upcoming Townhall & Tech All-Hands is scheduled for Friday at 4:00 PM. Please ensure your timesheets for the current sprint are logged before Thursday EOD.',
      likes: 24,
      commentsCount: 7,
    },
  ]);

  const [newPostContent, setNewPostContent] = useState('');

  const handleLike = (id: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const isLiked = p.hasLiked;
          return {
            ...p,
            hasLiked: !isLiked,
            likes: isLiked ? p.likes - 1 : p.likes + 1,
          };
        }
        return p;
      }),
    );
  };

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;
    const newPost: FeedPost = {
      id: `post-${Date.now()}`,
      author: 'Mithun Gowda H',
      avatar: 'M',
      role: 'Software Engineer',
      time: 'Just now',
      type: 'ANNOUNCEMENT',
      content: newPostContent,
      likes: 0,
      commentsCount: 0,
    };
    setPosts([newPost, ...posts]);
    setNewPostContent('');
  };

  return (
    <div className="space-y-4">
      {/* Create Post Card */}
      <div className="bg-white rounded-[6px] border border-slate-200/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <form onSubmit={handleCreatePost} className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
              M
            </div>
            <Textarea
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="Share an update, shoutout, or announcement with your team..."
              rows={2}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-sky-500 focus:bg-white focus:outline-none transition-colors"
            />
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                Public · Smarteam Org
              </span>
            </div>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={!newPostContent.trim()}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded shadow-2xs transition-colors cursor-pointer"
            >
              Post Update
            </Button>
          </div>
        </form>
      </div>

      {/* Feed Posts */}
      <div className="space-y-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="bg-white rounded-[6px] border border-slate-200/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3"
          >
            {/* Author Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {post.avatar}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">{post.author}</div>
                  <div className="text-[10px] text-slate-500">
                    {post.role} · {post.time}
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  post.type === 'ANNOUNCEMENT'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : post.type === 'KUDOS'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-purple-50 text-purple-700 border-purple-200'
                }`}
              >
                {post.type}
              </span>
            </div>

            {/* Content */}
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {post.content}
            </p>

            {/* Action Bar */}
            <div className="flex items-center gap-4 pt-2 border-t border-slate-100 text-xs text-slate-500">
              <Button
                onClick={() => handleLike(post.id)}
                className={`flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                  post.hasLiked ? 'text-sky-600 font-bold' : 'hover:text-slate-800'
                }`}
              >
                <svg
                  className="h-4 w-4"
                  fill={post.hasLiked ? 'currentColor' : 'none'}
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
                <span>
                  {post.likes} {post.likes === 1 ? 'Like' : 'Likes'}
                </span>
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
                <span>{post.commentsCount} Comments</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
