import React from 'react'

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export const LeftCaretIcon: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

// Simple easing metaphors: line, ease-in (ramp), ease-out (fall), ease-in-out (S curve)
export const EaseLinearIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <line x1="4" y1="20" x2="20" y2="4" />
  </svg>
)

export const EaseInIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M4 20 C10 20 14 12 20 4" />
  </svg>
)

export const EaseOutIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M4 20 C10 12 14 4 20 4" />
  </svg>
)

export const EaseInOutIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M4 20 C8 20 10 12 12 12 C14 12 16 4 20 4" />
  </svg>
)

export const SettingsIcon: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M8 0C8.27614 0 8.5 0.223858 8.5 0.5V1.5C8.5 1.77614 8.27614 2 8 2C7.72386 2 7.5 1.77614 7.5 1.5V0.5C7.5 0.223858 7.72386 0 8 0Z"
      fill="currentColor"
    />
    <path
      d="M8 14C8.27614 14 8.5 14.2239 8.5 14.5V15.5C8.5 15.7761 8.27614 16 8 16C7.72386 16 7.5 15.7761 7.5 15.5V14.5C7.5 14.2239 7.72386 14 8 14Z"
      fill="currentColor"
    />
    <path
      d="M0 8C0 7.72386 0.223858 7.5 0.5 7.5H1.5C1.77614 7.5 2 7.72386 2 8C2 8.27614 1.77614 8.5 1.5 8.5H0.5C0.223858 8.5 0 8.27614 0 8Z"
      fill="currentColor"
    />
    <path
      d="M14 8C14 7.72386 14.2239 7.5 14.5 7.5H15.5C15.7761 7.5 16 7.72386 16 8C16 8.27614 15.7761 8.5 15.5 8.5H14.5C14.2239 8.5 14 8.27614 14 8Z"
      fill="currentColor"
    />
    <path
      d="M2.10051 2.10051C2.29278 1.90824 2.60731 1.90824 2.79958 2.10051L3.50609 2.80702C3.69836 2.99929 3.69836 3.31382 3.50609 3.50609C3.31382 3.69836 2.99929 3.69836 2.80702 3.50609L2.10051 2.79958C1.90824 2.60731 1.90824 2.29278 2.10051 2.10051Z"
      fill="currentColor"
    />
    <path
      d="M12.4939 12.4939C12.6862 12.3017 13.0007 12.3017 13.1929 12.4939L13.8995 13.2004C14.0917 13.3927 14.0917 13.7072 13.8995 13.8995C13.7072 14.0917 13.3927 14.0917 13.2004 13.8995L12.4939 13.1929C12.3017 13.0007 12.3017 12.6862 12.4939 12.4939Z"
      fill="currentColor"
    />
    <path
      d="M2.10051 13.8995C1.90824 13.7072 1.90824 13.3927 2.10051 13.2004L2.80702 12.4939C2.99929 12.3017 3.31382 12.3017 3.50609 12.4939C3.69836 12.6862 3.69836 13.0007 3.50609 13.1929L2.79958 13.8995C2.60731 14.0917 2.29278 14.0917 2.10051 13.8995Z"
      fill="currentColor"
    />
    <path
      d="M12.4939 3.50609C12.3017 3.31382 12.3017 2.99929 12.4939 2.80702L13.2004 2.10051C13.3927 1.90824 13.7072 1.90824 13.8995 2.10051C14.0917 2.29278 14.0917 2.60731 13.8995 2.79958L13.1929 3.50609C13.0007 3.69836 12.6862 3.69836 12.4939 3.50609Z"
      fill="currentColor"
    />
    <path
      d="M5.5 8C5.5 6.61929 6.61929 5.5 8 5.5C9.38071 5.5 10.5 6.61929 10.5 8C10.5 9.38071 9.38071 10.5 8 10.5C6.61929 10.5 5.5 9.38071 5.5 8Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
)
