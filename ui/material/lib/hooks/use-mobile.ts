import { useMedia } from 'react-use';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
	const matches = useMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

	return matches;
}
