# UI Flow Recorder - Features Guide

## Recording Management

### Delete Recording
- **Button**: Red 🗑 Delete button in the viewer toolbar
- **Functionality**: Permanently removes a recording from storage
- **Safety**: Confirmation dialog prevents accidental deletion
- **Behavior**: After deletion, automatically selects the previous recording if available
- **Implementation**: Uses Chrome storage API for persistent deletion

### Play/Slideshow
- **Button**: Green ▶ Play button in the viewer toolbar  
- **Functionality**: Automatically cycles through all recorded steps
- **Timing**: 2-second interval per step for easy visualization
- **Status Display**: Real-time counter showing "Playing: X/Y" (current step / total steps)
- **Controls**: 
  - Click Play to start slideshow
  - Click Pause button that appears during playback to stop
  - Manual navigation (Prev/Next) automatically pauses playback
  - Slideshow automatically stops at the last step

## Implementation Details

### Storage Layer (`src/shared/storage.ts`)
- `deleteRun(runIdToDelete: string)`: Removes a recording from storage by ID

### Viewer Logic (`src/viewer/viewer.ts`)
- `onDelete()`: Handles deletion with confirmation and UI refresh
- `onPlayStart()`: Initiates slideshow with 2-second interval cycling
- `onPlayPause()`: Stops playback and re-enables play button
- `updatePlaybackStatus()`: Updates the status display with current position

### UI Elements (`src/viewer/viewer.html`)
- Play button: `<button id="playBtn">▶ Play</button>`
- Delete button: `<button id="deleteBtn">🗑 Delete</button>`
- Pause button: `<button id="pausePlayBtn">⏸ Pause</button>` (hidden when not playing)
- Playback info: `<div id="playbackInfo">` shows current step and pause control

### Styling (`src/viewer/viewer.css`)
- `.playback-info`: Flexbox layout for playback status and pause button
- Green accent color for playback status text
- Responsive button styling with hover effects

## User Workflow

1. **Viewing Recordings**: Select a recording from the left sidebar
2. **Playback**: Click Play to see the recording as an automatic slideshow
3. **Manual Control**: Use Prev/Next to step through manually (pauses auto-play)
4. **Deletion**: Click Delete to remove the recording (confirmation required)
5. **Export**: Export individual recordings as JSON
6. **Import**: Import previously exported recordings

## Testing

All features have been tested and compiled successfully:
- ✅ Delete removes recordings from storage completely
- ✅ Play cycles through steps at 2-second intervals
- ✅ Status counter updates in real-time
- ✅ Pause button stops playback
- ✅ Manual navigation pauses auto-play
- ✅ All event listeners properly bound
- ✅ No compilation errors
- ✅ Extension fully deployable

## Files Modified

- `src/shared/storage.ts` - Added deleteRun function
- `src/viewer/viewer.ts` - Added delete and play handlers
- `src/viewer/viewer.html` - Added UI buttons
- `src/viewer/viewer.css` - Added playback styling
- All compiled to `dist/` folder
