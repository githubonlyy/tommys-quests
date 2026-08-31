import Avatar from '../avatar/Avatar.jsx'

const PX = { sm: 56, md: 88, lg: 128 }

/**
 * The hero at a few standard sizes. Thin wrapper over the SVG doll so call
 * sites do not each hardcode pixel heights.
 */
export default function HeroAvatar({ size = 'md', className = '', equipped, themeId }) {
  return <Avatar size={PX[size] ?? size} className={className} equipped={equipped} themeId={themeId} />
}
