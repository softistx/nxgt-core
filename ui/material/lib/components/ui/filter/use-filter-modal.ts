import { useCallback, useState } from 'react';
import type { FilterValues } from './types';

export function useFilterModal(onApply?: (values: FilterValues) => void) {
	const [open, setOpen] = useState(false);
	const handleApply = useCallback(
		(values: FilterValues) => {
			onApply?.(values);
			setOpen(false);
		},
		[onApply],
	);

	return { open, handleOpenChange: setOpen, handleApply };
}
