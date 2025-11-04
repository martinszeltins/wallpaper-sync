# Wallpaper Sync Script

This Node.js script automatically syncs wallpapers across devices via Dropbox. When you set a wallpaper on any device, it gets copied to Dropbox and applied on all other devices automatically.

## Directory Structure

```
/home/martins/Dropbox/Photos/wallpaper/
├── nov-16-moonlight-bats-nocal-1920x1200.png
├── wallpaper-2025-11-04T15-30-00-000Z.jpg
└── wallpaper.txt   ← list of all wallpapers that have already been synced

~/.local/state/wallpaper-sync/
├── debug.log                    ← detailed sync activity logs
└── last-script-wallpaper.txt    ← tracks script vs user changes
```

## How It Works

### Bidirectional Sync
Every 10 minutes, the script performs two types of sync:

#### 1. Local → Dropbox (Upload Changes)
1. **Detect User Changes**: Checks if you manually changed your wallpaper
2. **Smart Upload**: Only syncs wallpapers changed by users (not by the script itself)
3. **Copy to Dropbox**: Copies new user-set wallpapers to the Dropbox folder with timestamps
4. **Track**: Marks the wallpaper as synced in `wallpaper.txt`

#### 2. Dropbox → Local (Download Changes)
1. **Check for New Files**: Looks for new images in Dropbox that aren't in `wallpaper.txt`
2. **Apply Newest**: Sets the most recent new wallpaper as your current wallpaper
3. **Update State**: Tracks that this wallpaper was set by the script (to prevent re-uploading)

### Race Condition Prevention
The script intelligently distinguishes between:
- **User changes**: When you manually set a wallpaper → Gets synced to Dropbox
- **Script changes**: When the script applies a wallpaper from Dropbox → Doesn't get re-synced

This prevents devices from fighting over which wallpaper should be active.

## The Workflow

1. Set any image as wallpaper on **Device A** 
2. Within 10 minutes, the script copies it to Dropbox
3. **Device B** detects the new wallpaper and applies it automatically
4. **Device C** also gets the same wallpaper automatically
5. All devices stay in sync without conflicts!

## Usage

The script is designed to run in the background forever. Run this on every device where you want the wallpaper to sync:

```bash
node app.js
```

### Logging
- Detailed logs are written to `~/.local/state/wallpaper-sync/debug.log`
- Logs are automatically rotated to keep the last 1000 lines
- All activity is also printed to the console

### Requirements
- **Node.js** (ESM modules supported)
- **GNOME Desktop** (uses `gsettings` for wallpaper management)
- **Dropbox** sync folder configured
- **Linux** environment

## Autostart

Place the `wallpaper-sync.desktop` file in your `~/.config/autostart/` directory to have it start automatically on login.

## Troubleshooting

- **Check logs**: `tail -f ~/.local/state/wallpaper-sync/debug.log`
- **Verify Dropbox**: Ensure `/home/martins/Dropbox/Photos/wallpaper/` exists and is syncing
- **Test manually**: Change wallpaper and check if it appears in Dropbox within 10 minutes
- **Multiple devices**: Make sure the script is running on all devices you want to sync
