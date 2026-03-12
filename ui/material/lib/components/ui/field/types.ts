import type { AutocompleteProps } from '../autocomplete';
import type { CheckCardFieldProps } from '../check-card-field';
import type { CheckboxGroupProps } from '../checkbox-group';
import type { DateFieldProps } from '../date-field';
import type { DateRangeFieldProps } from '../date-range-field';
import type { ImageFieldProps } from '../image-field';
import type { LocationFieldProps } from '../location-field';
import type { OtpFieldProps } from '../otp-field';
import type { RadioGroupProps } from '../radio-group';
import type { RichTextEditorProps } from '../rich-text-editor/rich-text-editor';
import type { SelectCardFieldProps } from '../select-card-field';
import type { SelectChipFieldProps } from '../select-chip-field';
import type { SelectFieldProps } from '../select-field';
import type { SliderProps } from '../slider';
import type { SwitchProps } from '../switch';
import type { TextFieldProps } from '../text-field';
import type { TextareaProps } from '../textarea-field';
import type { TimeFieldProps } from '../time-field';
import type { UploadFieldProps } from '../upload-field';

export type FieldType =
	| 'text'
	| 'number'
	| 'textarea'
	| 'select'
	| 'multi-select'
	| 'chips-single'
	| 'chips-multiple'
	| 'radio-group'
	| 'checkbox-group'
	| 'switch'
	| 'date'
	| 'date-range'
	| 'slider'
	| 'time'
	| 'location'
	| 'image'
	| 'upload'
	| 'otp'
	| 'autocomplete'
	| 'rich-text-editor'
	| 'check-card'
	| 'select-card';

export type FieldConfig =
	| ({ type: 'text' } & Omit<TextFieldProps, 'type'>)
	| ({ type: 'number' } & Omit<TextFieldProps, 'type'>)
	| ({ type: 'textarea' } & TextareaProps)
	| ({ type: 'select' } & SelectFieldProps)
	| ({ type: 'multi-select' } & AutocompleteProps)
	| ({ type: 'chips-single' } & SelectChipFieldProps)
	| ({ type: 'chips-multiple' } & SelectChipFieldProps)
	| ({ type: 'radio-group' } & RadioGroupProps)
	| ({ type: 'checkbox-group' } & CheckboxGroupProps)
	| ({ type: 'switch' } & SwitchProps)
	| ({ type: 'date' } & DateFieldProps)
	| ({ type: 'date-range' } & DateRangeFieldProps)
	| ({ type: 'slider' } & SliderProps)
	| ({ type: 'time' } & TimeFieldProps)
	| ({ type: 'location' } & LocationFieldProps)
	| ({ type: 'image' } & ImageFieldProps)
	| ({ type: 'upload' } & UploadFieldProps)
	| ({ type: 'otp' } & OtpFieldProps)
	| ({ type: 'autocomplete' } & AutocompleteProps)
	| ({ type: 'rich-text-editor' } & RichTextEditorProps)
	| ({ type: 'check-card' } & CheckCardFieldProps)
	| ({ type: 'select-card' } & SelectCardFieldProps);
