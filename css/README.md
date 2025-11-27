# CSS Structure

This directory is organized by page to facilitate merging with other repositories and maintain clear separation of concerns.

## Directory Layout

```
css/
├── form/          # Form page specific styles
├── shared/        # Shared styles across all pages
└── thankyou/      # Thank you page styles (to be added)
```

## Form Page Styles (`form/`)

Form-specific components and interactions:
- `base.css` - Global resets, form wrapper, structure
- `form-elements.css` - Question blocks, labels, text
- `inputs.css` - Text inputs, textareas, dropdowns
- `checkboxes-radios.css` - Checkbox/radio including FITB
- `tables-matrix.css` - Matrix table styling
- `tooltips.css` - Tooltip/description styling
- `rich-text-editor.css` - nicEdit customization
- `errors.css` - Error state styling
- `buttons-progress.css` - Buttons and progress bars
- `review-print.css` - Review page and print styles

## Shared Styles (`shared/`)

Styles used across multiple pages:
- `preferences.css` - Jotform theme preferences
- `mobile.css` - Mobile responsive overrides
- `utilities.css` - Helper classes and branding

## Usage

The HTML file loads shared styles first, then page-specific styles:

```html
<!-- Shared styles -->
<link rel="stylesheet" href="css/shared/preferences.css" />
<link rel="stylesheet" href="css/shared/mobile.css" />
<link rel="stylesheet" href="css/shared/utilities.css" />

<!-- Form page styles -->
<link rel="stylesheet" href="css/form/base.css" />
<!-- ... more form styles ... -->
```

## Adding New Pages

When merging the thank you page or adding other pages:

1. Create a new directory: `css/thankyou/`
2. Add page-specific styles to that directory
3. Update the respective HTML to reference the new paths
4. Keep shared styles in `css/shared/` for reuse
