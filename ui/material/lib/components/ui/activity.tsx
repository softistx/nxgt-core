'use client';

import {
	Activity as ActivityBase,
	type ActivityProps as ActivityBaseProps,
} from 'react';

export type ActivityProps = Omit<ActivityBaseProps, 'mode'> & {
	visible?: boolean;
};

export function Activity({ visible = false, ...props }: ActivityProps) {
	return <ActivityBase {...props} mode={visible ? 'visible' : 'hidden'} />;
}
