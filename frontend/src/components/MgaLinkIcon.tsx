import React from 'react';

export interface MgaLinkIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  hideArrow?: boolean;
}

export const MgaLinkIcon: React.FC<MgaLinkIconProps> = ({
  className = '',
  style,
  hideArrow = false,
  ...props
}) => {
  return (
    <svg
      viewBox={hideArrow ? "0 0 24 12" : "0 0 33 12"}
      width={hideArrow ? "24" : "30"}
      height={hideArrow ? "12" : "11"}
      fill="none"
      className={`family-link-icon overview-mga-icon ${className}`.trim()}
      aria-hidden="true"
      style={{ verticalAlign: 'middle', display: 'inline-block', ...style }}
      {...props}
    >
      <text
        x={hideArrow ? "12" : "0"}
        y="9.5"
        textAnchor={hideArrow ? "middle" : "start"}
        fontSize={hideArrow ? "9" : "8.5"}
        fontWeight="700"
        fill="currentColor"
        fontFamily="inherit, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        letterSpacing="0.03em"
      >
        MGA
      </text>
      {!hideArrow && (
        <path
          d="M25 3.5h6v6M31 3.5l-6 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
};

export default MgaLinkIcon;
