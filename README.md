# Wallpaper Sync Script

This small Node.js script automatically keeps your GNOME wallpaper in sync with the contents of your Dropbox wallpaper folder across devices.

## Directory Structure

```
/home/martins/Dropbox/Photos/wallpaper/
├── nov-16-moonlight-bats-nocal-1920x1200.png
├── some-other-wallpaper.jpg
└── wallpaper.txt   ← list of all wallpapers that have already been used
```

## How It Works

1. **Monitor**: Every 10 minutes, the script looks inside the wallpaper folder.
2. **Compare**: It compares all image filenames with the ones listed in `wallpaper.txt`.
3. **Detect**: If it finds a new image that's not listed yet, it assumes that's a new wallpaper.
4. **Apply**: It immediately sets that image as your GNOME wallpaper using `gsettings`.
5. **Track**: It appends the filename to `wallpaper.txt` so it knows it's already handled.
6. **Repeat**: Then it sleeps for 10 minutes and repeats forever.

## The Concept

The idea is simple: you just drop a new image into your Dropbox wallpaper folder, and this script will notice it, set it as wallpaper, and mark it as done.

## Usage

The script is designed to run in the background forever. For example, you can start it automatically on system boot. Run this on every device where you want the wallpaper to sync:

```bash
node app.js
```
