# UI Flow Recorder - Delete & Play Feature Test Cases

## Test Case 1: Delete Recording
**Objective**: Verify delete functionality works correctly

### Setup
1. Have multiple recordings in storage
2. Open the viewer
3. Select a recording from the sidebar

### Test Steps
1. Click the red 🗑 Delete button
2. Verify confirmation dialog appears with message "Delete recording [ID]...? This cannot be undone."
3. Click Cancel in confirmation dialog
4. Verify recording still appears in the list
5. Click Delete button again
6. Click OK in confirmation dialog
7. Verify recording is removed from the sidebar list
8. Verify a different recording is selected automatically

### Expected Results
- ✅ Confirmation dialog prevents accidental deletion
- ✅ Recording removed from storage permanently
- ✅ UI updates to show next recording
- ✅ If no recordings remain, viewer shows empty state
- ✅ Playback stops if active during deletion

---

## Test Case 2: Play Slideshow - Basic Playback
**Objective**: Verify play feature cycles through steps

### Setup
1. Select a recording with multiple steps (10+ steps recommended)
2. Viewer shows first step

### Test Steps
1. Click the green ▶ Play button
2. Verify button becomes disabled
3. Verify playback info appears showing "Playing: 1/X"
4. Wait 2 seconds
5. Verify step automatically advances to step 2
6. Verify playback info updates to "Playing: 2/X"
7. Wait for steps to auto-advance through entire recording
8. Verify playback stops at final step
9. Verify Play button re-enables

### Expected Results
- ✅ Slideshow starts immediately
- ✅ Steps advance every 2 seconds
- ✅ Status counter updates in real-time
- ✅ Stops automatically at last step
- ✅ Play button re-enabled at end

---

## Test Case 3: Play Slideshow - Pause Control
**Objective**: Verify pause button stops playback

### Setup
1. Select a recording
2. Click Play to start slideshow

### Test Steps
1. Wait for 1-2 steps to advance automatically
2. Click the ⏸ Pause button
3. Verify playback stops immediately
4. Verify playback info disappears
5. Verify current step stays visible
6. Wait 5+ seconds
7. Verify step does NOT advance
8. Click Play again
9. Verify slideshow resumes from paused position

### Expected Results
- ✅ Pause button stops auto-advancement
- ✅ Manual pause at any point works
- ✅ Can resume playback from pause point
- ✅ Step data preserved during pause

---

## Test Case 4: Manual Navigation During Playback
**Objective**: Verify manual controls pause slideshow

### Setup
1. Select a recording
2. Click Play to start slideshow

### Test Steps
1. While slideshow is playing, click Next button
2. Verify playback immediately stops
3. Verify current step advances manually
4. Verify playback info disappears
5. Repeat with Prev button
6. Verify same behavior - playback pauses on manual navigation

### Expected Results
- ✅ Manual navigation pauses auto-play
- ✅ Users can manually step through after pause
- ✅ Can resume with Play button if desired

---

## Test Case 5: Multiple Recordings with Delete
**Objective**: Verify delete works correctly with multiple recordings

### Setup
1. Have 3+ recordings in storage
2. Open viewer

### Test Steps
1. Select middle recording
2. Click Delete and confirm
3. Verify previous recording is now selected
4. Select first recording
5. Click Delete and confirm
6. Verify second recording (now first) is selected
7. Delete remaining recordings one by one
8. Verify empty state appears when no recordings left

### Expected Results
- ✅ Logic selects previous position after delete
- ✅ Works at boundaries (first, middle, last)
- ✅ Gracefully handles empty state
- ✅ UI properly clears when no recordings exist

---

## Test Case 6: Playback with Recording Deletion
**Objective**: Verify playback stops if recording is deleted

### Setup
1. Select a recording
2. Start playback with Play button

### Test Steps
1. While slideshow is running, click Delete
2. Confirm deletion
3. Verify slideshow stops immediately
4. Verify playback info disappears
5. Verify recording is removed

### Expected Results
- ✅ Playback automatically stops on deletion
- ✅ No errors occur during deletion while playing
- ✅ UI properly cleans up

---

## Verification Checklist

### Functional Verification
- [x] Delete button removes recordings from Chrome storage
- [x] Delete shows confirmation dialog
- [x] Play button cycles through steps at 2-second intervals
- [x] Pause button stops playback
- [x] Status display shows "Playing: X/Y"
- [x] Manual navigation pauses auto-play
- [x] Playback stops at final step

### Build Verification
- [x] Source files compile without errors
- [x] All dist files present and valid
- [x] Event listeners properly bound
- [x] HTML elements all exist with correct IDs
- [x] CSS styling applied correctly

### Code Quality
- [x] No console errors
- [x] No TypeScript compilation errors
- [x] All functions properly implemented
- [x] No memory leaks (intervals cleared properly)
- [x] Proper error handling in place

