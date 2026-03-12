import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FilterDialog } from '../filter-dialog';
import { FilterDrawer } from '../filter-drawer';
import { FilterInline } from '../filter-inline';
import { FilterPopover } from '../filter-popover';
import { FilterSheet } from '../filter-sheet';
import type { FilterSchema, FilterValues } from '../types';

// ============================================================================
// Meta Configuration
// ============================================================================

const meta = {
	title: 'Components/Filter',
	component: FilterInline,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof FilterInline>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Sample Schemas
// ============================================================================

const basicSchema: FilterSchema = {
	fields: [
		{
			id: 'search',
			type: 'text',
			label: 'Search',
			placeholder: 'Search products...',
		},
		{
			id: 'category',
			type: 'select',
			label: 'Category',
			placeholder: 'Select category',
			options: [
				{ label: 'Electronics', value: 'electronics' },
				{ label: 'Clothing', value: 'clothing' },
				{ label: 'Books', value: 'books' },
				{ label: 'Home & Garden', value: 'home' },
			],
		},
		{
			id: 'price',
			type: 'number-range',
			label: 'Price Range',
			min: 0,
			max: 10000,
			step: 10,
		},
		{
			id: 'inStock',
			type: 'switch',
			label: 'In Stock Only',
		},
	],
};

const allTypesSchema: FilterSchema = {
	fields: [
		{
			id: 'text',
			type: 'text',
			label: 'Text Field',
			placeholder: 'Enter text...',
		},
		{
			id: 'number',
			type: 'number',
			label: 'Number Field',
			placeholder: 'Enter number',
			min: 0,
			max: 100,
		},
		{
			id: 'slider',
			type: 'slider',
			label: 'Slider Field',
			placeholder: 'SLide to select valie',
			min: 0,
			max: 100,
		},
		{
			id: 'select',
			type: 'select',
			label: 'Select Field',
			placeholder: 'Choose option',
			options: [
				{ label: 'Option 1', value: '1' },
				{ label: 'Option 2', value: '2' },
				{ label: 'Option 3', value: '3' },
			],
		},
		{
			id: 'multiSelect',
			type: 'multi-select',
			label: 'Multi-Select',
			placeholder: 'Choose multiple',
			options: [
				{ label: 'Tag A', value: 'a' },
				{ label: 'Tag B', value: 'b' },
				{ label: 'Tag C', value: 'c' },
			],
		},
		{
			id: 'date',
			type: 'date',
			label: 'Date',
			placeholder: 'Select date',
		},
		{
			id: 'dateRange',
			type: 'date-range',
			label: 'Date Range',
			placeholder: 'Select range',
		},
		{
			id: 'numberRange',
			type: 'number-range',
			label: 'Number Range',
			min: 0,
			max: 1000,
		},
		{
			id: 'slideRange',
			type: 'slider-range',
			label: 'Slide Range',
			min: 0,
			step: 1,
			max: 100,
		},
		{
			id: 'chipsMultiple',
			type: 'chips-multiple',
			label: 'Chips Multiple',
			options: [
				{ label: 'Feature A', value: 'a' },
				{ label: 'Feature B', value: 'b' },
				{ label: 'Feature C', value: 'c' },
			],
		},
		{
			id: 'chipsSingle',
			type: 'chips-single',
			label: 'Chips Single',
			options: [
				{ label: 'Small', value: 's' },
				{ label: 'Medium', value: 'm' },
				{ label: 'Large', value: 'l' },
			],
		},
		{
			id: 'checkboxGroup',
			type: 'checkbox-group',
			label: 'Checkbox Group',
			options: [
				{ label: 'Feature A', value: 'a' },
				{ label: 'Feature B', value: 'b' },
				{ label: 'Feature C', value: 'c' },
			],
		},
		{
			id: 'radioGroup',
			type: 'radio-group',
			label: 'Radio Group',
			options: [
				{ label: 'Small', value: 's' },
				{ label: 'Medium', value: 'm' },
				{ label: 'Large', value: 'l' },
			],
		},
		{
			id: 'switch',
			type: 'switch',
			label: 'Toggle Option',
		},
	],
};

const groupedSchema: FilterSchema = {
	fields: [
		{
			id: 'search',
			type: 'text',
			label: 'Search',
			placeholder: 'Search...',
		},
		{
			id: 'category',
			type: 'multi-select',
			label: 'Categories',
			options: [
				{ label: 'Electronics', value: 'electronics' },
				{ label: 'Clothing', value: 'clothing' },
				{ label: 'Books', value: 'books' },
			],
		},
		{
			id: 'minPrice',
			type: 'number',
			label: 'Min Price',
			min: 0,
			placeholder: 'Min',
		},
		{
			id: 'maxPrice',
			type: 'number',
			label: 'Max Price',
			min: 0,
			placeholder: 'Max',
		},
		{
			id: 'inStock',
			type: 'switch',
			label: 'In Stock',
		},
		{
			id: 'onSale',
			type: 'switch',
			label: 'On Sale',
		},
		{
			id: 'rating',
			type: 'select',
			label: 'Min Rating',
			options: [
				{ label: '4+ Stars', value: '4' },
				{ label: '3+ Stars', value: '3' },
				{ label: '2+ Stars', value: '2' },
			],
		},
		{
			id: 'brand',
			type: 'checkbox-group',
			label: 'Brands',
			options: [
				{ label: 'Brand A', value: 'a' },
				{ label: 'Brand B', value: 'b' },
				{ label: 'Brand C', value: 'c' },
			],
		},
	],
	groups: [
		{
			id: 'main',
			label: 'Main Filters',
			fields: ['search', 'category'],
			defaultExpanded: true,
		},
		{
			id: 'price',
			label: 'Price & Availability',
			fields: ['minPrice', 'maxPrice', 'inStock', 'onSale'],
			collapsible: true,
			defaultExpanded: true,
		},
		{
			id: 'advanced',
			label: 'Advanced Options',
			fields: ['rating', 'brand'],
			collapsible: true,
			defaultExpanded: false,
		},
	],
};

const validatedSchema: FilterSchema = {
	fields: [
		{
			id: 'email',
			type: 'text',
			label: 'Email',
			placeholder: 'user@example.com',
			validation: {
				required: true,
				pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
			},
		},
		{
			id: 'age',
			type: 'number',
			label: 'Age',
			placeholder: 'Enter age',
			min: 18,
			max: 120,
			validation: {
				required: true,
				min: 18,
				max: 120,
			},
		},
		{
			id: 'country',
			type: 'select',
			label: 'Country',
			placeholder: 'Select country',
			options: [
				{ label: 'United States', value: 'us' },
				{ label: 'United Kingdom', value: 'uk' },
				{ label: 'Canada', value: 'ca' },
			],
			validation: {
				required: true,
			},
		},
		{
			id: 'terms',
			type: 'switch',
			label: 'Accept Terms',
			validation: {
				required: true,
			},
		},
	],
};

const separatorSchema: FilterSchema = {
	fields: [
		{
			id: 'search',
			type: 'text',
			label: 'Search',
			placeholder: 'Search...',
		},
		{
			id: 'category',
			type: 'select',
			label: 'Category',
			separator: 'before', // Separator before this field
			options: [
				{ label: 'Electronics', value: 'electronics' },
				{ label: 'Clothing', value: 'clothing' },
			],
		},
		{
			id: 'price',
			type: 'number-range',
			label: 'Price Range',
			separator: 'after', // Separator after this field
			min: 0,
			max: 1000,
		},
		{
			id: 'inStock',
			type: 'switch',
			label: 'In Stock',
		},
	],
};

// ============================================================================
// Stories
// ============================================================================

export const Inline: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component(args) {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[800px]">
				<FilterInline
					{...args}
					values={values}
					onApply={(newValues) => {
						setValues(newValues);
						console.log('Applied filters:', newValues);
					}}
				/>
			</div>
		);
	},
};

export const Dialog: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<FilterDialog
				schema={basicSchema}
				values={values}
				onApply={(newValues) => {
					setValues(newValues);
					console.log('Applied filters:', newValues);
				}}
				title="Product Filters"
				description="Filter products by category, price, and availability"
			/>
		);
	},
};

export const Sheet: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<FilterSheet
				schema={basicSchema}
				values={values}
				onApply={(newValues) => {
					setValues(newValues);
					console.log('Applied filters:', newValues);
				}}
				title="Filters"
				side="bottom"
			/>
		);
	},
};

export const Drawer: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<FilterDrawer
				schema={basicSchema}
				values={values}
				onApply={(newValues) => {
					setValues(newValues);
					console.log('Applied filters:', newValues);
				}}
				title="Filters"
				direction="left"
			/>
		);
	},
};

export const Popover: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<FilterPopover
				schema={basicSchema}
				values={values}
				onApply={(newValues) => {
					setValues(newValues);
					console.log('Applied filters:', newValues);
				}}
			/>
		);
	},
};

export const AllFilterTypes: Story = {
	args: {
		schema: allTypesSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[1000px]">
				<FilterInline
					schema={allTypesSchema}
					values={values}
					onApply={(newValues) => {
						setValues(newValues);
						console.log('Applied filters:', newValues);
					}}
				/>
			</div>
		);
	},
};

export const WithGroups: Story = {
	args: {
		schema: groupedSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[1000px]">
				<FilterInline
					schema={groupedSchema}
					values={values}
					onApply={(newValues) => {
						setValues(newValues);
						console.log('Applied filters:', newValues);
					}}
				/>
			</div>
		);
	},
};

export const WithValidation: Story = {
	args: {
		schema: validatedSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[800px]">
				<FilterInline
					schema={validatedSchema}
					values={values}
					onApply={(newValues) => {
						setValues(newValues);
						console.log('Applied filters:', newValues);
					}}
				/>
			</div>
		);
	},
};

export const WithSeparators: Story = {
	args: {
		schema: separatorSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[800px]">
				<FilterInline
					schema={separatorSchema}
					values={values}
					onApply={(newValues) => {
						setValues(newValues);
						console.log('Applied filters:', newValues);
					}}
				/>
				<p className="mt-4 text-sm text-muted-foreground">
					Demonstrates separators before and after filter fields for visual
					grouping
				</p>
			</div>
		);
	},
};

export const WithPersistence: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[800px]">
				<FilterInline
					schema={basicSchema}
					values={values}
					onApply={(newValues) => {
						setValues(newValues);
						console.log('Applied filters:', newValues);
					}}
					persistence={{
						enabled: true,
						strategy: 'localStorage',
						storageKey: 'demo-filters',
					}}
				/>
				<p className="mt-4 text-sm text-muted-foreground">
					Filters are persisted to localStorage
				</p>
			</div>
		);
	},
};

export const WithUrlPersistence: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[800px]">
				<FilterInline
					schema={basicSchema}
					values={values}
					onApply={(newValues) => {
						setValues(newValues);
						console.log('Applied filters:', newValues);
					}}
					persistence={{
						enabled: true,
						strategy: 'url',
						urlParams: {
							enabled: true,
							prefix: 'f_',
						},
					}}
				/>
				<p className="mt-4 text-sm text-muted-foreground">
					Filters are synced with URL parameters (check the URL bar)
				</p>
			</div>
		);
	},
};

export const WithPresets: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[800px]">
				<FilterInline
					schema={basicSchema}
					values={values}
					onApply={(newValues) => {
						setValues(newValues);
						console.log('Applied filters:', newValues);
					}}
					presetConfig={{
						enabled: true,
						storage: 'localStorage',
						storageKey: 'demo-presets',
						maxPresets: 10,
					}}
				/>
			</div>
		);
	},
};

export const LiveUpdate: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		return (
			<div className="w-[800px]">
				<FilterInline
					schema={basicSchema}
					values={values}
					onChange={(newValues) => {
						setValues(newValues);
						console.log('Live update:', newValues);
					}}
					liveUpdate={true}
				/>
				<p className="mt-4 text-sm text-muted-foreground">
					Changes apply immediately (no Apply button)
				</p>
			</div>
		);
	},
};

export const ProductFilterExample: Story = {
	args: {
		schema: basicSchema,
	},
	render: function Component() {
		const [values, setValues] = useState<FilterValues>({});

		const productSchema: FilterSchema = {
			fields: [
				{
					id: 'search',
					type: 'text',
					label: 'Search Products',
					placeholder: 'Search by name or SKU...',
				},
				{
					id: 'category',
					type: 'multi-select',
					label: 'Categories',
					placeholder: 'All categories',
					options: [
						{ label: 'Laptops', value: 'laptops' },
						{ label: 'Phones', value: 'phones' },
						{ label: 'Tablets', value: 'tablets' },
						{ label: 'Accessories', value: 'accessories' },
						{ label: 'Wearables', value: 'wearables' },
					],
				},
				{
					id: 'priceRange',
					type: 'number-range',
					label: 'Price Range ($)',
					min: 0,
					max: 5000,
					step: 50,
				},
				{
					id: 'inStock',
					type: 'switch',
					label: 'In Stock Only',
					defaultValue: false,
				},
				{
					id: 'onSale',
					type: 'switch',
					label: 'On Sale',
					defaultValue: false,
				},
				{
					id: 'rating',
					type: 'select',
					label: 'Minimum Rating',
					placeholder: 'Any rating',
					options: [
						{ label: '5 Stars', value: '5' },
						{ label: '4+ Stars', value: '4' },
						{ label: '3+ Stars', value: '3' },
						{ label: '2+ Stars', value: '2' },
					],
				},
				{
					id: 'brands',
					type: 'checkbox-group',
					label: 'Brands',
					options: [
						{ label: 'Apple', value: 'apple' },
						{ label: 'Samsung', value: 'samsung' },
						{ label: 'Google', value: 'google' },
						{ label: 'Microsoft', value: 'microsoft' },
						{ label: 'Dell', value: 'dell' },
						{ label: 'HP', value: 'hp' },
					],
					collapsible: true,
					defaultExpanded: true,
				},
				{
					id: 'condition',
					type: 'radio-group',
					label: 'Condition',
					defaultValue: 'any',
					options: [
						{ label: 'Any', value: 'any' },
						{ label: 'New', value: 'new' },
						{ label: 'Refurbished', value: 'refurbished' },
						{ label: 'Used', value: 'used' },
					],
				},
			],
			groups: [
				{
					id: 'basic',
					label: 'Basic Filters',
					fields: ['search', 'category'],
					defaultExpanded: true,
				},
				{
					id: 'price',
					label: 'Price & Availability',
					fields: ['priceRange', 'inStock', 'onSale'],
					collapsible: true,
					defaultExpanded: true,
				},
				{
					id: 'quality',
					label: 'Quality & Condition',
					fields: ['rating', 'condition'],
					collapsible: true,
					defaultExpanded: true,
				},
				{
					id: 'brands',
					label: 'Brands',
					fields: ['brands'],
					collapsible: true,
					defaultExpanded: false,
				},
			],
		};

		return (
			<FilterDialog
				schema={productSchema}
				values={values}
				onApply={(newValues) => {
					setValues(newValues);
					console.log('Applied product filters:', newValues);
				}}
				title="Filter Products"
				description="Narrow down your search with advanced filters"
				persistence={{
					enabled: true,
					strategy: 'localStorage',
					storageKey: 'product-filters',
				}}
				presetConfig={{
					enabled: true,
					storage: 'localStorage',
					storageKey: 'product-filter-presets',
					maxPresets: 10,
				}}
			/>
		);
	},
};
