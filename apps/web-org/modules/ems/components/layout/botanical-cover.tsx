'use client';

import { Button } from '@smarteam/ui';

import React from 'react';

interface BotanicalCoverProps {
  coverUrl?: string | null;
  onEditCover?: () => void;
  heightClass?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
}

export function BotanicalCover({
  coverUrl,
  onEditCover,
  heightClass = 'h-44 sm:h-52',
  title,
  subtitle,
  badge,
}: BotanicalCoverProps) {
  const imageUrl =
    coverUrl ||
    'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=1600&q=80';

  return (
    <div className={`relative ${heightClass} w-full overflow-hidden bg-[#0A2016] select-none`}>
      {/* 1. Lush Botanical Foliage Vector Art & Pattern (Guaranteed render even offline) */}
      <div className="absolute inset-0 bg-[#0A2016] overflow-hidden pointer-events-none">
        <svg
          className="absolute w-full h-full object-cover opacity-60 mix-blend-screen"
          viewBox="0 0 1200 400"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="leafGrad1" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.2" />
            </radialGradient>
            <radialGradient id="leafGrad2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#065F46" stopOpacity="0.1" />
            </radialGradient>
            <linearGradient id="stemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="100%" stopColor="#022C22" />
            </linearGradient>
          </defs>

          {/* Tropical Leaf Clusters */}
          <g opacity="0.75">
            {/* Monstera & Palm Fronds */}
            <path
              d="M-50 200 C 100 50, 250 120, 350 0 C 450 150, 300 350, 100 380 Z"
              fill="url(#leafGrad1)"
            />
            <path
              d="M150 400 C 250 200, 450 180, 600 50 C 700 220, 550 380, 300 400 Z"
              fill="url(#leafGrad2)"
            />
            <path
              d="M450 400 C 600 150, 800 180, 950 20 C 1050 200, 900 380, 650 400 Z"
              fill="url(#leafGrad1)"
            />
            <path
              d="M750 400 C 900 180, 1100 150, 1250 10 C 1350 220, 1200 390, 950 400 Z"
              fill="url(#leafGrad2)"
            />
            <path
              d="M50 0 C 200 120, 350 100, 500 250 C 350 300, 150 220, -20 150 Z"
              fill="url(#leafGrad2)"
              opacity="0.6"
            />
            <path
              d="M700 0 C 850 150, 1000 100, 1150 280 C 1000 320, 800 220, 600 120 Z"
              fill="url(#leafGrad1)"
              opacity="0.6"
            />
          </g>

          {/* Dense Foliage Highlights */}
          <circle cx="200" cy="150" r="180" fill="#059669" opacity="0.3" filter="blur(40px)" />
          <circle cx="650" cy="120" r="220" fill="#10B981" opacity="0.25" filter="blur(50px)" />
          <circle cx="1050" cy="160" r="200" fill="#047857" opacity="0.35" filter="blur(45px)" />
        </svg>
      </div>

      {/* 2. Photo Overlay (If image loads successfully, blends on top) */}
      <img
        src={imageUrl}
        alt="Botanical Foliage Header"
        className="absolute inset-0 w-full h-full object-cover object-center mix-blend-luminosity opacity-40 brightness-110 contrast-125 pointer-events-none"
        onError={(e) => {
          (e.target as HTMLElement).style.display = 'none';
        }}
      />

      {/* 3. Dark Aesthetic Gradient Vignette Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#091C14]/90 via-[#0A2016]/30 to-black/20 pointer-events-none" />

      {/* 4. Edit Cover Photo Button (Single clean button on top right) */}
      {onEditCover && (
        <div className="absolute top-3 right-3 sm:right-6 z-10">
          <Button
            onClick={onEditCover}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-[5px] bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white text-[11px] font-semibold transition-all shadow-md cursor-pointer"
            title="Update cover photo"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>Edit Cover Photo</span>
          </Button>
        </div>
      )}

      {/* 5. Optional Title Overlay */}
      {(title || subtitle || badge) && (
        <div className="absolute bottom-4 left-4 sm:left-6 z-10 text-white">
          {badge && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded">
                {badge}
              </span>
              {subtitle && <span className="text-xs text-slate-300 font-mono">{subtitle}</span>}
            </div>
          )}
          {title && (
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white drop-shadow-sm">
              {title}
            </h1>
          )}
        </div>
      )}
    </div>
  );
}
