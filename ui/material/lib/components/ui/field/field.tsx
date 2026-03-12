'use client';

import React from 'react';
import { RenderField } from './renderers';
import type { FieldConfig } from './types';

export type FieldProps = {
	config: FieldConfig;
};

/**
 * Field - Generic field component that renders based on configuration
 */
export const Field = React.memo(({ config }: FieldProps) => {
	return <RenderField {...config} />;
});
