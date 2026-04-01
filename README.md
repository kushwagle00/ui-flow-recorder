# UI Flow Recorder

A Chrome extension that records user interactions with web pages, capturing clicks, inputs, navigations, screenshots, and element selectors. Perfect for creating automated test flows, documenting user journeys, and building UI interaction datasets.

## Features

- **Record interactions** - Automatically capture clicks, text inputs, and page navigations
- **Screenshots** - Store visual context for each recorded step
- **Smart selectors** - Generate CSS selectors for recorded elements with fallback alternatives
- **Element snapshots** - Preserve element information (tag, text, attributes) at the time of interaction
- **Visual context** - Store viewport dimensions and pointer coordinates for each step
- **Run history** - Maintain a history of all recorded flows
- **Export capabilities** - Export recorded flows for analysis and automation

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Chrome browser

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ui-flow-recorder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load into Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder

## Usage

### Recording a Flow

1. Click the extension icon (UI Flow Recorder) in your Chrome toolbar
2. Click "Start Recording" to begin capturing interactions
3. Interact with the web page - clicks, typing, and navigation are automatically recorded
4. Click "Stop Recording" when finished
5. View your recorded flow in the built-in viewer or export it

### Viewing Recordings

- Click "Open Viewer" in the extension popup to see a detailed visualization of all recorded steps
- The viewer displays:
  - Step type (click, input, navigation)
  - Element information and CSS selectors
  - Screenshots for visual context
  - URL and timestamp for each step

## Project Structure

```
src/
├── background/
│   └── background.ts          # Service worker - handles recording state and message routing
├── content/
│   └── content.ts             # Content script - captures interactions from the page
├── popup/
│   ├── popup.ts               # Popup UI logic
│   ├── popup.html             # Popup interface
│   └── popup.css              # Popup styles
├── viewer/
│   ├── viewer.ts              # Viewer application logic
│   ├── viewer.html            # Viewer interface
│   └── viewer.css             # Viewer styles
├── shared/
│   ├── types.ts               # TypeScript type definitions
│   ├── messaging.ts           # Chrome message types
│   ├── storage.ts             # Storage API wrapper
│   └── selectorBuilder.ts     # CSS selector generation
└── hello-mv3/                 # Reference/example code
```

## Build Scripts

- `npm run build:js` - Compile TypeScript files to JavaScript
- `npm run build:static` - Copy static assets (HTML, CSS, manifest) to `dist/`
- `npm run build` - Run both build steps

## Architecture

### Message Flow

The extension uses Chrome's message passing API to coordinate between different components:

1. **Content Script** (page context)
   - Listens for user interactions (clicks, inputs)
   - Sends "RECORD_STEP" messages to background
   - Injects selector generation logic

2. **Background Service Worker**
   - Manages recording state (`isRecording` flag)
   - Routes messages between popup, content scripts, and storage
   - Handles lifecycle: TOGGLE_RECORDING, GET_STATUS, STOP_AND_EXPORT
   - Captures screenshots via Chrome tabs API

3. **Popup UI**
   - Displays current recording status
   - Provides Start/Stop Recording buttons
   - Shows current run ID and step count
   - Opens the viewer

4. **Storage**
   - Uses Chrome local storage API
   - Stores current run (in-progress recording)
   - Maintains history of completed runs

### Data Model

Each recorded **Step** contains:

```typescript
{
  stepId: number;               // Unique step identifier
  timestamp: number;            // When the step occurred
  type: "click" | "input" | "navigation";
  url: string;                  // Page URL at time of step
  element?: ElementSnapshot;    // Element information (if applicable)
  selectors?: Selectors;        // Primary and fallback CSS selectors
  value?: string;               // Input value (for input steps)
  visualContext?: {
    screenshotDataUrl?: string; // Base64 encoded PNG
    viewport?: { width; height; devicePixelRatio };
    pointer?: { x; y; units: "viewport-px" };
  };
}
```

A **Run** groups multiple steps into a single recording session:

```typescript
{
  runId: string;                // UUID for the run
  startedAt: number;            // Timestamp when recording started
  stoppedAt?: number;           // Timestamp when recording stopped
  steps: Step[];                // All recorded steps
}
```

## Known Limitations

- Screenshots cannot be captured on restricted pages (chrome://, Firefox extensions, PDF viewer, Chrome Web Store)
- Some pages with strict CSP policies may restrict content script execution
- Selector generation works best with semantic HTML and standard element attributes

## Development

### Watch Mode (Coming Soon)

For development, you can rebuild on file changes:

```bash
npm run watch
```

### Debugging

- **Background Worker**: Right-click extension icon → "Manage extension" → "Inspect" (from background page link)
- **Content Script**: Open DevTools (F12) on any webpage, switch to the extension's context
- **Popup**: Right-click extension icon → "Inspect popup"

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## Troubleshooting

### Extension not appearing
- Ensure the `dist` folder was created and contains built files
- Verify all build scripts ran successfully: `npm run build`
- Try removing and re-adding the extension

### Recording not working
- Verify the extension has permission to run on the current site
- Check that content scripts are injected (look for RECORD_STEP messages in console)
- Ensure the service worker is active (no errors in background page)

### Screenshots not captured
- Some sites block screenshots via browser security policies
- PDF viewers and system pages cannot be screenshot
- Try a different website to verify the feature works

## Changelog

### v0.1.0
- Initial release
- Basic click, input, and navigation recording
- Screenshot capture support
- CSS selector generation
- Run history and export functionality
