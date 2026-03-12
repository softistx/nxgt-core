import type { Meta, StoryObj } from '@storybook/react';
import { Calendar, Home, Inbox, Menu, Search, Settings } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from './buttons/icon-button';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenuItem,
	SidebarMenuLabel,
} from './sidebar';
import { TooltipProvider } from './tooltip';

const meta = {
	title: 'Navigation/Sidebar',
	component: Sidebar,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
	{
		title: 'Home',
		url: '#',
		icon: Home,
	},
	{
		title: 'Inbox',
		url: '#',
		icon: Inbox,
	},
	{
		title: 'Calendar',
		url: '#',
		icon: Calendar,
	},
	{
		title: 'Search',
		url: '#',
		icon: Search,
	},
	{
		title: 'Settings',
		url: '#',
		icon: Settings,
	},
];

export const Default: Story = {
	args: {},
	render: function Component(props) {
		const [active, setActive] = useState(0);
		const [expanded, setExpanded] = useState(true);
		return (
			<div className="w-lg">
				<TooltipProvider>
					<Sidebar
						{...props}
						expanded={expanded}
						onExpandedChange={setExpanded}
						className="min-h-[30rem]"
					>
						<SidebarHeader>
							<IconButton
								onClick={() => {
									setExpanded((previous) => !previous);
								}}
								variant={'outlined'}
								className="rounded"
							>
								<Menu />
							</IconButton>
						</SidebarHeader>
						<SidebarContent>
							<SidebarMenuLabel>Project</SidebarMenuLabel>
							{items.map((item, index) => (
								<SidebarMenuItem
									key={`item-${index.toString()}`}
									active={active === index}
									icon={<item.icon />}
									onClick={() => {
										setActive(index);
									}}
								>
									{item.title}
								</SidebarMenuItem>
							))}
						</SidebarContent>
						<SidebarFooter>
							{items
								.slice(items.length - 1, items.length)
								.map((item, index) => (
									<SidebarMenuItem
										key={`item-${index.toString()}`}
										icon={<item.icon />}
										onClick={() => {
											setActive(index);
										}}
									>
										{item.title}
									</SidebarMenuItem>
								))}
						</SidebarFooter>
					</Sidebar>
				</TooltipProvider>
			</div>
		);
	},
};
