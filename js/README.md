# JavaScript Structure

This directory is organized by page to facilitate merging with other repositories and maintain clear separation of concerns.

## Directory Layout

```
js/
├── form/          # Form page specific scripts
├── shared/        # Shared scripts across all pages
│   └── vendor/    # Third-party libraries
└── thankyou/      # Thank you page scripts (to be added)
```

## Form Page Scripts (`form/`)

Form-specific functionality:
- `jotform.js` - Main Jotform functionality
- `protoplus.js` - Extended prototype methods
- `protoplus-ui-form.js` - UI form enhancements
- `prototype.js` - Base prototype extensions
- `calendarview.js` - Calendar/date picker
- `errorNavigation.js` - Error handling and navigation
- `location.js` - Geolocation functionality

## Shared Scripts (`shared/`)

Scripts used across multiple pages:
- `vendor/` - Third-party libraries
  - `json2.js` - JSON polyfill
  - `smoothscroll.min.js` - Smooth scrolling

## Usage

Load shared scripts first, then page-specific scripts as needed.

## Adding New Pages

When merging the thank you page or adding other pages:

1. Create a new directory: `js/thankyou/`
2. Add page-specific scripts to that directory
3. Update the respective HTML to reference the new paths
4. Keep shared utilities in `js/shared/` for reuse
