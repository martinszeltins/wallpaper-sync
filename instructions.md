# AI Instructions

I have an idea for an app. I want to create a Wallpaper sync app which would sync my wallpaper across all my computers. The app would use Dropbox to store the wallpaper images. The idea is actually very simple. When a wallpaper is changed on GNOME, it gets copied to ~/.config/background. My app would monitor that file for changes using Linux inotify system. When the background file changes, the app would copy the background file to Dropbox and make a note in a local config file about having handled / set this wallpaper. It would also set up another watcher for Dropbox and watch the wallpaper files in Dropbox. When it detects a change, it would do a lookup and compare if all the wallpaper files in Dropbox have been handled. Actually, we only need to take the very newest one and see if that one has been handled. If not then it would set that wallpaper as the GNOME wallpaper and mark it as handled in the config file. The app would be started at login and run in the background forever. That's the main idea.

Now lets look at the details of how this will be implemented.

So this is going to be a simple Node script. Plain JavaScript. No TypeScript. All in one file. Just clean, modern JavaScript with clean good code, best programming practices, SOLID, etc. Variable names should be meaningful, no short names that are difficult to understand. Good, clean, readable code. This needs to work only on modern Linux and GNOME so it should be simple. Coding style should be clean - 4 spaces, no semicolons. Modern JavaScript, arrow functions, async/await etc. Add meaningful logs too. No emojis please. Prefix log messages with [info], [warn], [error]. Make this script resilient please, handle errors and try to keep it from crashing by catching errors and retrying. Add all necessary files like package.json etc.

Please also create a README.md (don't use emojis). Explain what this script is and how it works and how to install it. Keep it simple. Provide also please a .desktop file which the user will be able to copy to ~/.config/autostart

[Desktop Entry]
Name=Wallpaper Sync
Comment=Wallpaper Sync
Exec=/home/martins/.nvm/versions/node/v22.17.1/bin/node /home/martins/Programming/wallpaper-sync/app.js
Terminal=false
Type=Application
Categories=Utility;
X-GNOME-Autostart-enabled=true

The script will be run at the same time on all computers in the world. When the script runs it will set up 2 watchers.

1) The first watcher will watch the GNOME wallpaper file at ~/.config/background for changes. Since this file is deleted and recreated every time the wallpaper changes, we will need to watch the parent directory ~/.config and look for create events for the background file.

We can use the 'chokidar' npm package to set up the watcher. Watch the whole ~/.config directory and filter events for the background file. Make sure to batch and debounce changes so we do not accidentally receive multiple updates that are identical and perform the action multiple times at once. I don't know if chokidar supports such batching/debounce or we need to do it ourselves.

Then when a change is detected, copy the ~/.config/background file to the Dropbox wallpaper folder at ~/Dropbox/Photos/wallpaper/wallpaper-<datetime>. The <datetime> should be in ISO format with colons replaced by dashes to make it a valid filename. So for example wallpaper-2024-06-15T14-30-00. No file extension is needed. The datetime will help us understand which wallpaper file is the newest. So that later when we watch the Dropbox wallpaper directory for changes and we list all wallpaper files in there, we are only interested in the newest one and we will easily be able to determine which one that is by looking at the datetime in the filename.

The other thing we will need to do is mark the file as handled in a config file. Each computer will have its own config file stored user's home directory where Linux normally stores app specific local config files e.g. ~/.config/wallpaper-sync/config.json. The config file will be a simple JSON file with an array of handled wallpaper filenames, like this:

{
  "handledWallpapers": [
    "wallpaper-2024-06-15T14-30-00",
    "wallpaper-2024-06-15T15-00-00"
  ]
}

We will also use logging for debugging and log to two places - on the screen (stdout) and to a log file at ~/.config/wallpaper-sync/wallpaper-sync.log. Keep it simple. Make sure our log file does not exceed 1000 lines! Always keep the last 1000 lines, remove older lines as needed. Simple code! Maybe we can use winston npm package and set up 2 transports for the logger? For log file we will again use standard Linux place for app specific local config files e.g. ~/.local/state/wallpaper-sync/debug.log. We will output the path to both directories on script start so use is aware of them.

2) The second watcher will watch the Dropbox wallpaper directory at ~/Dropbox/Photos/wallpaper for changes. Again we can use 'chokidar' for this.

When a change is detected in the Dropbox wallpaper directory, we will list all wallpaper files in there (only ones with datetime in filename), determine which one is the newest by looking at the datetime in the filename, then check our local config file (~/.config/wallpaper-sync/config.json) to see if that wallpaper file has been handled already. If it has not been handled, we will set it as the GNOME wallpaper using 'gsettings' command, and then mark it as handled in our config file.

settings set org.gnome.desktop.background picture-uri ...
settings set org.gnome.desktop.background picture-uri-dark ...

Simple stuff.

1) On script startup we will need to check our Dropbox wallpaper directory to see if some new file is there which hasn't been handled that has appeared while the script wasn't running and handle that file - set it as wallpaper, mark it as handled.

And that's it. The app will run forever in the background, watching both locations for changes and syncing wallpapers across all computers. We want to avoid race conditions at all costs. We want to make sure the ~/config/background file exists before we do anything. Check again before copying it. We will need to create our app config file (~/.config/wallpaper-sync/config.json) and our app log file (~/.local/state/wallpaper-sync/debug.log). We want to avoid the race condition also locally. We will be copying the file to dropbox and watching the dropbox files at the same time. We need to ensure we mark the file as handled BEFORE copying to dropbox so that the dropbox watcher does not go in a loop and try to set the wallpaper again because it detects a change. It will see that it has already been handled by looking at our app config file.

The code needs to be kept simple, easy to read, all in one simple app.js file which will be run like `node app.js`. I like clean code, good programming practices. No fancy stuff. Just clean, readable, maintainable code. Make sure anyone can easily understand it and read it like a book.

The idea for this script is actually very simple, we don't need to complicate things. We simply have 2 watchers. One watching wallpaper being set and the other watching the Dropbox (which indicate when other computers have set a wallpaper). When any computer changes its wallpaper - we copy it over to Dropbox so other computers can pick it up and set it as wallpaper for themselves. That should achieve our goal of syncing wallpapers across all our computers as long as this script is running on all of them.
