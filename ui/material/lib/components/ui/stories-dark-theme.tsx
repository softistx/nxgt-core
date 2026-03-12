import type { PropsWithChildren } from 'react';

export function DarkTheme({ children }: PropsWithChildren) {
	return <div className="dark">{children}</div>;
}
