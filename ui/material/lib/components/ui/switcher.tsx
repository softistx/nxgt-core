import { Check, ChevronsUpDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn, Label } from '../../main';
import { Avatar, AvatarFallback } from './avatar';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from './dropdown-menu';

export type SwitcherItem = {
	id: string;
	icon?: ReactNode;
	title: string;
	subtitle: string;
};

export type SwitcherProps = {
	options: SwitcherItem[];
	label: ReactNode;
	value: SwitcherItem;
	onValueChange?: (value: SwitcherItem) => void;
} & Omit<ComponentProps<typeof DropdownMenuTrigger>, 'value'>;

export function Switcher({
	value,
	onValueChange,
	options,
	label,
	className,
	...props
}: SwitcherProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					'flex items-center gap-2 bg-accent py-2.5 px-3 rounded',
					'[&_svg:not([class*=size-])]:data-[slot=icon]::size-8 [&_svg:not([class*=size-])]:data-[slot=icon]::fill-primary/80',
					className,
				)}
				data-pw={props.name ?? 'switcher-trigger'}
				{...props}
			>
				{value.icon ?? (
					<Avatar className="rounded-lg h-8 w-8">
						<AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
							{value.title[0]}
						</AvatarFallback>
					</Avatar>
				)}
				<div className="text-start flex flex-col gap-1 leading-none">
					<span className="text-sm leading-none font-semibold truncate max-w-[17ch]">
						{value.title}
					</span>
					<span className="text-xs text-muted-foreground truncate max-w-[20ch]">
						{value.subtitle}
					</span>
				</div>
				<ChevronsUpDown className="ml-6 h-4 w-4 text-muted-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="flex flex-col w-full gap-1"
				align="center"
			>
				<DropdownMenuLabel>
					<Label htmlFor="">{label}</Label>
				</DropdownMenuLabel>
				{options.map((item, index) => (
					<DropdownMenuItem
						key={item.id}
						onClick={() => onValueChange?.(item)}
						className={cn(
							'[&_svg:not([class*=size-])]:data-[slot=icon]::size-8 [&_svg:not([class*=size-])]:data-[slot=icon]:fill-foreground/80',
							{
								'bg-primary/15 data-[slot=icon]:not([class*=size-]):fill-primary/80':
									value.id === item.id,
							},
						)}
						data-pw={`${props.name ?? 'option'}-${index}`}
					>
						<div className="flex items-center gap-2 ">
							{item.icon ?? (
								<Avatar className="rounded-md h-8 w-8">
									<AvatarFallback className="rounded-md bg-primary/10 text-foreground">
										{item.title[0]}
									</AvatarFallback>
								</Avatar>
							)}
							<div className="flex flex-col">
								<span>{item.title}</span>
								<span className="text-xs text-muted-foreground">
									{item.subtitle}
								</span>
							</div>
						</div>
						{value.id === item.id && <Check className="ml-auto" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
