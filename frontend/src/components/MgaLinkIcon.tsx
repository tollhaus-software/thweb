import React from 'react';

export interface MgaLinkIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const MgaLinkIcon: React.FC<MgaLinkIconProps> = ({
  className = '',
  style,
  ...props
}) => {
  return (
    <svg
      viewBox="0 0 33 12"
      width="30"
      height="11"
      fill="none"
      className={`family-link-icon overview-mga-icon ${className}`.trim()}
      aria-hidden="true"
      style={{ verticalAlign: 'middle', display: 'inline-block', ...style }}
      {...props}
    >
      <text
        x="0"
        y="9.5"
        fontSize="8.5"
        fontWeight="700"
        fill="currentColor"
        fontFamily="inherit, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        letterSpacing="0.03em"
      >
        MGA
      </text>
      <path
        d="M25 3.5h6v6M31 3.5l-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default MgaLinkIcon;
