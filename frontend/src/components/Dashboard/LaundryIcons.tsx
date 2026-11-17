import React from 'react';
import { ArrowRight } from 'lucide-react';

export interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Washer (Washing machine) SVG icon
 */
export const WasherIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`laundry-svg-icon ${className || ''}`}
    aria-hidden="true"
  >
    {/* Outer machine housing */}
    <rect x="3" y="2" width="18" height="20" rx="2" />
    {/* Control panel separator */}
    <line x1="3" y1="7" x2="21" y2="7" />
    {/* Control knob */}
    <circle cx="7.5" cy="4.5" r="1" fill="currentColor" />
    {/* Status indicator dots */}
    <circle cx="16" cy="4.5" r="0.75" fill="currentColor" />
    <circle cx="18" cy="4.5" r="0.75" fill="currentColor" />
    {/* Porthole door */}
    <circle cx="12" cy="14.5" r="4.5" />
    {/* Water wave inside drum */}
    <path d="M9.5 14.5c.8-1 1.7-1 2.5 0s1.7 1 2.5 0" />
  </svg>
);

/**
 * Tumbler Dryer SVG icon (European care symbol: square with inscribed circle, without dots)
 */
export const DryerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`laundry-svg-icon ${className || ''}`}
    aria-hidden="true"
  >
    {/* European care symbol for tumble dryer: square with inscribed circle */}
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="12" cy="12" r="7" />
  </svg>
);

/**
 * Laundry Bin / Basket SVG icon
 * Modeled after classic laundry hamper with folded towel hanging over front and ventilation holes
 */
export const LaundryBinIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`laundry-svg-icon ${className || ''}`}
    aria-hidden="true"
  >
    {/* Clothes in background above the rim */}
    <path d="M6.5 6l1.8-3.5 7.7 2.5 3-2 1.5 3" />
    {/* Basket rim left of towel */}
    <path d="M4 6h5" />
    <path d="M4 8.5h5" />
    <path d="M4 6a1 1 0 0 0-1 1v.5a1 1 0 0 0 1 1" />
    {/* Basket rim right of towel */}
    <path d="M19 6h1a1 1 0 0 1 1 1v.5a1 1 0 0 1-1 1h-1" />
    {/* Towel hanging over front edge of rim */}
    <path d="M9 6v6.5a1.2 1.2 0 0 0 1.2 1.2h7.6a1.2 1.2 0 0 0 1.2-1.2V6" />
    {/* Tapered basket body */}
    <path d="M5.5 8.5l1.3 11a2 2 0 0 0 2 1.8h6.4a2 2 0 0 0 2-1.8l1.3-11" />
    {/* Capsule ventilation holes */}
    <line x1="7.2" y1="10.5" x2="7.2" y2="12" />
    <line x1="7.2" y1="14.5" x2="7.2" y2="16" />
    <line x1="10.2" y1="15" x2="10.2" y2="16.5" />
    <line x1="13.8" y1="15" x2="13.8" y2="16.5" />
    <line x1="16.8" y1="14.5" x2="16.8" y2="16" />
    <line x1="10.5" y1="18.5" x2="10.5" y2="19.5" />
    <line x1="13.5" y1="18.5" x2="13.5" y2="19.5" />
  </svg>
);

/**
 * Cupboard / Wardrobe SVG icon (tall, without feet)
 */
export const CupboardIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`laundry-svg-icon ${className || ''}`}
    aria-hidden="true"
  >
    {/* Tall wardrobe / cupboard without feet */}
    <rect x="4" y="1.5" width="16" height="21" rx="1.5" />
    {/* Center divider between left and right doors */}
    <line x1="12" y1="1.5" x2="12" y2="22.5" />
    {/* Left door handle */}
    <line x1="9.5" y1="10.5" x2="9.5" y2="13.5" />
    {/* Right door handle */}
    <line x1="14.5" y1="10.5" x2="14.5" y2="13.5" />
  </svg>
);

/**
 * Composite Flow Icon: [Icon A] -> [Icon B]
 */
export const CompositeFlowIcon: React.FC<{
  from: React.ReactNode;
  to: React.ReactNode;
  arrowSize?: number;
  className?: string;
}> = ({ from, to, arrowSize = 14, className }) => (
  <span className={`kiosk-todo-icon-composite ${className || ''}`} aria-hidden="true">
    {from}
    <ArrowRight size={arrowSize} className="kiosk-todo-icon-arrow" strokeWidth={2.5} />
    {to}
  </span>
);
