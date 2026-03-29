import type { SVGProps } from 'react'

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

export function Icon({
  size = '1em',
  color = 'currentColor',
  width,
  height,
  style,
  children,
  ...props
}: IconProps) {
  return (
    <svg
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      {...props}
    >
      {children}
    </svg>
  )
}
