# Wallpaper Sync

A simple Node.js application that automatically syncs wallpapers across multiple Linux/GNOME computers using Dropbox.

## How It Works

The app monitors your GNOME wallpaper changes and syncs them across all your computers by storing wallpapers in a shared Dropbox folder. When you change your wallpaper on one computer, it automatically appears on all your other computers running this app.

### Core Functionality

1. **Local Wallpaper Monitoring**: Watches the GNOME background file (`~/.config/background`) for changes
2. **Dropbox Upload**: When a wallpaper changes, copies it to `~/Dropbox/Photos/wallpaper/` with a timestamp
3. **Remote Wallpaper Detection**: Monitors the Dropbox wallpaper folder for new files from other computers
4. **Automatic Wallpaper Setting**: Sets new wallpapers from Dropbox as your GNOME background
5. **Duplicate Prevention**: Tracks handled wallpapers to avoid infinite loops

## Prerequisites

- Linux with GNOME desktop environment
- Node.js (version 14 or higher)
- Dropbox installed and synced
- `gsettings` command available (standard on GNOME)

## Installation

1. Clone or download this repository to your desired location:
   ```bash
   cd ~/Programming
   git clone <repository-url> wallpaper-sync
   cd wallpaper-sync
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Ensure your Dropbox is set up and syncing. The app will create the wallpaper folder at:
   ```
   ~/Dropbox/Photos/wallpaper/
   ```

4. Test the application:
   ```bash
   npm start
   ```

## Automatic Startup

To have the app start automatically when you log in:

1. Copy the provided `.desktop` file to your autostart directory:
   ```bash
   cp wallpaper-sync.desktop ~/.config/autostart/
   ```

2. Edit the `.desktop` file to match your Node.js and app installation paths:
   ```bash
   nano ~/.config/autostart/wallpaper-sync.desktop
   ```

3. Update the `Exec` line with your correct paths:
   ```
   Exec=/path/to/node /path/to/wallpaper-sync/app.js
   ```

## Configuration

The app automatically creates configuration files in standard Linux locations:

- **Config**: `~/.config/wallpaper-sync/config.json` - Tracks handled wallpapers
- **Logs**: `~/.local/state/wallpaper-sync/debug.log` - Application logs (max 1MB, rotated)

No manual configuration is required.

## Usage

1. **Start the app** on all computers where you want wallpaper sync
2. **Change your wallpaper** on any computer using GNOME settings or any wallpaper app
3. **Wait a few seconds** - the wallpaper should automatically appear on your other computers

The app runs silently in the background and logs its activity to both the console and log file.

## File Locations

- **GNOME Background**: `~/.config/background`
- **Dropbox Wallpapers**: `~/Dropbox/Photos/wallpaper/`
- **App Config**: `~/.config/wallpaper-sync/config.json`
- **App Logs**: `~/.local/state/wallpaper-sync/debug.log`

## Troubleshooting

### App Not Starting
- Check Node.js is installed: `node --version`
- Verify dependencies: `npm install`
- Check logs in `~/.local/state/wallpaper-sync/debug.log`

### Wallpapers Not Syncing
- Ensure Dropbox is running and synced
- Check the Dropbox wallpaper folder exists: `~/Dropbox/Photos/wallpaper/`
- Verify GNOME is setting wallpapers: Test with `gsettings set org.gnome.desktop.background picture-uri file:///path/to/image`

### Multiple Computers
- Install and run the app on ALL computers where you want sync
- Ensure all computers have access to the same Dropbox account
- Each computer maintains its own config file to prevent conflicts

## Technical Details

- **Language**: Modern JavaScript (ES6+)
- **Dependencies**: chokidar (file watching), winston (logging)
- **File Watching**: Uses Linux inotify system via chokidar
- **Wallpaper Format**: Files stored as `wallpaper-YYYY-MM-DDTHH-MM-SS` (ISO datetime)
- **Debouncing**: 2-second delay to batch rapid file changes
- **Error Handling**: Resilient operation with retry logic and error recovery

The app is designed to be lightweight, reliable, and run continuously in the background without user intervention.
