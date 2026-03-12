import type { Meta, StoryObj } from '@storybook/react';
import { Book, Calendar, User, Users } from 'lucide-react';
import { Button } from './buttons/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from './card';
import { Input } from './input';
import { Label } from './label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
	title: 'Navigation/Tabs',
	component: Tabs,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	render: function Component(props) {
		return (
			<Tabs defaultValue="account" className="w-[600px]" {...props}>
				<TabsList className="flex w-[550px] gap-4">
					<TabsTrigger icon={<User />} value="account">
						Account
					</TabsTrigger>
					<TabsTrigger icon={<Calendar />} value="calendar">
						Calendar
					</TabsTrigger>
					<TabsTrigger icon={<Book />} value="books">
						Books
					</TabsTrigger>
					<TabsTrigger icon={<Users />} value="users">
						Users
					</TabsTrigger>
				</TabsList>
				<TabsContent value="account">
					<Card>
						<CardHeader>
							<CardTitle>Account</CardTitle>
							<CardDescription>
								Make changes to your account here. Click save when you're done.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className="space-y-1">
								<Label htmlFor="name">Name</Label>
								<Input id="name" defaultValue="Pedro Duarte" />
							</div>
							<div className="space-y-1">
								<Label htmlFor="username">Username</Label>
								<Input id="username" defaultValue="@peduarte" />
							</div>
						</CardContent>
						<CardFooter>
							<Button>Save changes</Button>
						</CardFooter>
					</Card>
				</TabsContent>
				<TabsContent value="password">
					<Card>
						<CardHeader>
							<CardTitle>Password</CardTitle>
							<CardDescription>
								Change your password here. After saving, you'll be logged out.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2">
							<div className="space-y-1">
								<Label htmlFor="current">Current password</Label>
								<Input id="current" type="password" />
							</div>
							<div className="space-y-1">
								<Label htmlFor="new">New password</Label>
								<Input id="new" type="password" />
							</div>
						</CardContent>
						<CardFooter>
							<Button>Save password</Button>
						</CardFooter>
					</Card>
				</TabsContent>
			</Tabs>
		);
	},
};
