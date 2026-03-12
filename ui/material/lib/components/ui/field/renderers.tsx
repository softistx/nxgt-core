import { Autocomplete } from '../autocomplete';
import { CheckCardField } from '../check-card-field';
import { CheckboxGroup } from '../checkbox-group';
import { DateField } from '../date-field';
import { DateRangeField } from '../date-range-field';
import { ImageField } from '../image-field';
import { OtpField } from '../otp-field';
import { RadioGroup } from '../radio-group';
import { RichTextEditor } from '../rich-text-editor/rich-text-editor';
import { SelectCardField } from '../select-card-field';
import { SelectChipField } from '../select-chip-field';
import { SelectField } from '../select-field';
import { Slider } from '../slider';
import { Switch } from '../switch';
import { TextField } from '../text-field';
import { TextareaField } from '../textarea-field';
import { TimeField } from '../time-field';
import { UploadField } from '../upload-field';
import type { FieldConfig } from './types';

export function RenderField(config: FieldConfig) {
	const { type, ...props } = config as any;

	switch (type) {
		case 'text':
			return <TextField {...(props as any)} type="text" />;

		case 'number':
			return <TextField {...(props as any)} type="number" />;

		case 'textarea':
			return <TextareaField {...(props as any)} />;

		case 'select':
			return <SelectField {...(props as any)} />;

		case 'multi-select':
			return <Autocomplete {...(props as any)} mode="multiple" />;

		case 'chips-single':
			return <SelectChipField {...(props as any)} mode="single" />;

		case 'chips-multiple':
			return <SelectChipField {...(props as any)} mode="multiple" />;

		case 'radio-group':
			return <RadioGroup {...(props as any)} />;

		case 'checkbox-group':
			return <CheckboxGroup {...(props as any)} />;

		case 'switch':
			return <Switch {...(props as any)} />;

		case 'date':
			return <DateField {...(props as any)} />;

		case 'date-range':
			return <DateRangeField {...(props as any)} />;

		case 'slider':
			return <Slider {...(props as any)} />;

		case 'time':
			return <TimeField {...(props as any)} />;

		case 'image':
			return <ImageField {...(props as any)} />;

		case 'upload':
			return <UploadField {...(props as any)} />;

		case 'otp':
			return <OtpField {...(props as any)} />;

		case 'autocomplete':
			return <Autocomplete {...(props as any)} />;

		case 'rich-text-editor':
			return <RichTextEditor {...(props as any)} />;

		case 'check-card':
			return <CheckCardField {...(props as any)} />;

		case 'select-card':
			return <SelectCardField {...(props as any)} />;

		default:
			return (
				<div className="text-muted-foreground text-sm">
					Unsupported field type: {type}
				</div>
			);
	}
}
