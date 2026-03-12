# AGENTS.md - Development Guidelines for nxgt-material

This file contains essential guidelines for agentic coding assistants working on the nxgt-material React component library.

## Project Overview

nxgt-material is a React TypeScript component library built with:
- React 19 + TypeScript
- Vite for bundling
- Storybook for component development and documentation
- shadcn/ui design system with Radix UI primitives
- Tailwind CSS for styling
- Biome for linting and formatting
- Bun as the package manager

## Build, Lint, and Test Commands

### Core Development Commands
- **Development server**: `bun dev` (runs Storybook at port 6006)
- **Build library**: `bun build` (compiles TypeScript + Vite build + post-processing)
- **Type checking**: `bun tsc` (TypeScript compiler check only)

### Code Quality Commands
- **Lint and fix**: `bun lint` (Biome linter with auto-fix)
- **Format code**: `bun format` (Biome formatter with auto-fix)
- **Check all**: `bun check` (Biome comprehensive check with auto-fix)

### Testing Strategy
This project uses **Storybook for component testing** rather than traditional unit tests:
- Components are documented and tested through Storybook stories
- Run `bun storybook` to interactively test components
- Build Storybook: `bun build-storybook` for static deployment

### Running a Single Test
Since this project uses Storybook for testing:
1. Start Storybook: `bun dev`
2. Navigate to the specific component story you want to test
3. Interact with the component in the Storybook UI

For code validation without full Storybook:
- Type check: `bun tsc`
- Lint check: `bun check`

## Code Style Guidelines

### File Size Guidelines
- **Maximum file size**: 200 lines per file
- **Split large files** into focused modules when exceeding 200 lines
- **Exceptions**: Type definition files (`types.ts`) may exceed if all types are cohesive
- **Rationale**: Smaller files are easier to understand, test, and maintain

### Redux Toolkit Slice Pattern
For components with complex state management (e.g., filter, video-player):

**Slice as Single Source of Truth**:
- All state, actions, and selectors live in the slice file
- Custom hooks (`use-*.ts`) should be thin wrappers that:
  - Initialize the slice with `useSliceReducer`
  - React to state changes via `useEffect`
  - Provide minimal enhanced actions (validation, side effects only)
  - Avoid heavy wrapper functions around slice actions

**Slice Structure**:
```typescript
// component.slice.ts
import { createSlice } from '@reduxjs/toolkit';

export type ComponentState = {
  // All component state including config
  values: Record<string, unknown>;
  disabled: boolean;
  liveUpdate: boolean;
  // ... other state
};

const createInitialState = (overrides?: Partial<ComponentState>) => ({
  ...DEFAULT_STATE,
  ...overrides,
});

export const componentSlice = createSlice({
  name: 'component',
  initialState: createInitialState(),
  reducers: {
    // Actions that modify state
    setValue: (state, action) => { /* ... */ },
    // ...
  },
});

// Selectors - compute derived state
export const componentSelectors = {
  selectIsValid: (state: ComponentState) => !hasErrors(state.errors),
  selectActiveCount: (state: ComponentState) => countActive(state.values),
  selectCanApply: (state: ComponentState) => state.isDirty && !hasErrors(state.errors),
  // ...
};

export const componentActions = componentSlice.actions;
```

**Hook Pattern**:
```typescript
// use-component.ts (thin wrapper, <200 lines)
export function useComponent(options) {
  const [state, actions] = useSliceReducer(componentSlice, {
    disabled: options.disabled,
    liveUpdate: options.liveUpdate,
    // Pass config as initial state
  });

  // React to state changes
  useEffect(() => {
    if (prevState.values !== state.values && options.onChange) {
      options.onChange(state.values);
    }
  }, [state, options]);

  // Thin enhanced actions (validation/side effects only)
  const enhancedActions = useMemo(() => ({
    setValue: (field, value) => {
      if (state.disabled) return;
      actions.setValue({ field, value });
    },
    applyFilters: () => {
      const errors = validate(state.values);
      if (errors) return;
      actions.apply();
      options.onApply?.(state.values);
    },
  }), [state, actions, options]);

  // Use selectors from slice
  const isValid = componentSelectors.selectIsValid(state);
  const activeCount = componentSelectors.selectActiveCount(state);

  return { state, actions: enhancedActions, isValid, activeCount };
}
```

### TypeScript Configuration
- **Strict mode enabled** with all strict checks
- **Target**: ES2020
- **JSX**: React JSX transform (`react-jsx`)
- **Module resolution**: Bundler mode
- **Path aliases**: `@/*` maps to `./lib/*`
- **Unused variables/parameters**: Not allowed (enforced by TypeScript)

### Import Conventions
```typescript
// External dependencies first
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

// Internal imports with path aliases
import { cn } from '@/lib/utils';
import { Spinner } from '../spinner';

// Group imports by type, separate with blank lines
import type { ButtonProps } from './types';
```

### Component Structure
```typescript
// 1. External imports
import { Slot } from '@radix-ui/react-slot';

// 2. Internal imports
import { cn } from '@/lib/utils';

// 3. Type definitions (if not in separate file)
const variants = cva('base-classes', {
  variants: { /* variant definitions */ }
});

export type ComponentProps = ComponentProps<'button'> &
  VariantProps<typeof variants> & {
    customProp?: string;
  };

// 4. Component implementation
export function Component({ className, ...props }: ComponentProps) {
  return (
    <div className={cn(variants({ variant }), className)} {...props}>
      Content
    </div>
  );
}

// 5. Export additional utilities if needed
export { variants as componentVariants };
```

### Naming Conventions
- **Components**: PascalCase (e.g., `Button`, `TextField`)
- **Files**: kebab-case (e.g., `text-field.tsx`, `button-group.tsx`)
- **Directories**: kebab-case (e.g., `rich-text-editor/`)
- **Types**: PascalCase with descriptive names (e.g., `ButtonProps`, `SelectOption`)
- **Functions/Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **CSS Classes**: kebab-case in Tailwind

### Styling with Tailwind CSS
- Use the `cn()` utility from `@/lib/utils` for conditional classes
- Leverage CSS variables for theming (defined in `lib/styles.css`)
- Follow the established color system: primary, secondary, success, info, warning, error, default
- Use semantic color variants (primary, secondary, etc.) instead of hardcoded colors

### Component Variants Pattern
```typescript
const variants = cva('base-classes focus-visible:ring-ring/50', {
  variants: {
    variant: {
      filled: 'shadow-xs bg-primary text-primary-foreground',
      outlined: 'border shadow-xs',
      ghost: 'hover:bg-accent',
    },
    color: {
      primary: null, // Defined in compoundVariants
      secondary: null,
      success: null,
    }
  },
  compoundVariants: [
    {
      variant: 'filled',
      color: 'primary',
      class: 'bg-primary text-primary-foreground hover:bg-primary/90'
    }
    // ... more compound variants
  ]
});
```

### Error Handling
- Use TypeScript's strict null checks
- Prefer optional chaining (`?.`) and nullish coalescing (`??`)
- Throw descriptive errors with context
- Handle loading states appropriately (see Button component for loading pattern)

### Accessibility
- Include proper ARIA attributes
- Use semantic HTML elements
- Ensure keyboard navigation support
- Follow WCAG guidelines
- Test with Storybook's accessibility addon (`@storybook/addon-a11y`)

### File Organization

### Form Field Wrappers
All field components have corresponding React Hook Form wrappers located in `lib/components/ui/forms/`:
- Base field components (e.g., `text-field.tsx`) provide standalone functionality
- Form wrappers (e.g., `text-form-field.tsx`) integrate with React Hook Form using `Controller`
- Form wrappers handle validation, error states, and form state management automatically
- Both are exported through the main component index

Example form field wrapper:
```typescript
export function FieldFormField<T extends Record<string, any>>({
  control,
  name,
  ...props
}: { control: Control<T>; name: Path<T> } ### File Organization Omit<FieldProps, 'name'> ) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          {...props}
          aria-invalid={fieldState.invalid}
          value={field.value}
          onChange={field.onChange}
          error={fieldState.invalid}
          helperText={fieldState.error?.message}
        />
      )}
    />
  );
}
```

### File Organization
```
lib/
├── components/
│   ├── ui/           # Reusable UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── ...
│   └── index.ts      # Main component exports
├── lib/
│   ├── utils.ts      # Utility functions
│   ├── date.utils.ts # Domain-specific utilities
│   └── index.ts
├── hooks/            # Custom React hooks
├── styles.css        # Global styles and CSS variables
└── main.ts           # Library entry point
```

### Storybook Stories Structure
```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { Component } from '../Component';

const meta: Meta<typeof Component> = {
  title: 'UI/Component',
  component: Component,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    // Define controls for interactive testing
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    // Default props
  },
};

export const Variants: Story = {
  render: () => (
    <div className="space-y-4">
      {/* Multiple variants for comparison */}
    </div>
  ),
};
```

## Development Workflow

1. **Start development**: `bun dev` (opens Storybook)
2. **Make changes**: Edit components in `lib/components/ui/`
3. **Check code quality**: `bun check` (linting + formatting)
4. **Type check**: `bun tsc`
5. **Test visually**: Use Storybook to verify component behavior
6. **Build for production**: `bun build`

## Dependencies and Libraries

### Core UI Libraries
- **Radix UI**: Headless UI primitives for accessibility
- **Tailwind CSS**: Utility-first CSS framework
- **class-variance-authority**: Type-safe CSS variants
- **Lucide React**: Icon library
- **clsx + tailwind-merge**: Conditional class merging

### Specialized Libraries
- **TipTap**: Rich text editor
- **Leaflet**: Interactive maps
- **React Hook Form**: Form management
- **Date-fns**: Date utilities
- **Sonner**: Toast notifications

## Performance Considerations
- Use React.memo for expensive components when appropriate
- Leverage CSS containment and will-change for animations
- Optimize bundle size by lazy loading heavy components
- Use proper key props in lists
- Consider virtualization for large lists (react-window)

## Security Best Practices
- Sanitize user input, especially in rich text editor
- Use HTTPS for external API calls
- Avoid inline event handlers that could lead to XSS
- Validate file uploads and restrict file types
- Use Content Security Policy headers when possible

## Commit Guidelines
- Use conventional commit format
- Reference component names in commit messages
- Test changes in Storybook before committing
- Run `bun check` before committing

## Additional Resources
- [Biome Documentation](https://biomejs.dev/)
- [Storybook Documentation](https://storybook.js.org/)
- [Radix UI Documentation](https://www.radix-ui.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)</content>
<parameter name="filePath">/home/steve/workspace/dev/nxgt-material/AGENTS.md