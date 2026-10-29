import React from 'react';

export interface TodoHintIconProps {
  size?: number;
  className?: string;
  color?: string;
}

export const TodoHintIcon: React.FC<TodoHintIconProps> = ({
  size = 24,
  className,
  color = 'currentColor',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M8 3H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"
      fill={color}
      fillOpacity="0.06"
    />
    <path
      d="M8 2h8a1 1 0 0 1 1 1v2H7V3a1 1 0 0 1 1-1z"
      fill={color}
      fillOpacity="0.2"
    />
    {/* T */}
    <path d="M6.2 8h2.6 M7.5 8v3.2" strokeWidth="1.4" />
    {/* O */}
    <rect x="9.5" y="8" width="2.6" height="3.2" rx="0.9" strokeWidth="1.3" />
    {/* D */}
    <path d="M13.5 8h1.2a1.6 1.6 0 0 1 1.6 1.6v0a1.6 1.6 0 0 1-1.6 1.6h-1.2V8z" strokeWidth="1.4" />
    {/* O */}
    <rect x="17.6" y="8" width="2.6" height="3.2" rx="0.9" strokeWidth="1.3" />
    {/* Line 1 */}
    <path d="M6 13.5l1.2 1.2 2-2" strokeWidth="1.3" />
    <line x1="10.5" y1="13.5" x2="18" y2="13.5" strokeWidth="1.3" />
    {/* Line 2 */}
    <path d="M6 16.5l1.2 1.2 2-2" strokeWidth="1.3" />
    <line x1="10.5" y1="16.5" x2="18" y2="16.5" strokeWidth="1.3" />
    {/* Line 3 */}
    <path d="M6 19.5l1.2 1.2 2-2" strokeWidth="1.3" />
    <line x1="10.5" y1="19.5" x2="18" y2="19.5" strokeWidth="1.3" />
  </svg>
);
