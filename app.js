/**
 * Wallpaper Sync Script
 * 
 * This small Node.js script automatically keeps your GNOME wallpaper
 * in sync with the contents of your Dropbox wallpaper folder across devices.
 *
 * Folder structure:
 *   /home/martins/Dropbox/Photos/wallpaper/
 *     ├── nov-16-moonlight-bats-nocal-1920x1200.png
 *     ├── some-other-wallpaper.jpg
 *     └── wallpaper.txt   ← list of all wallpapers that have already been used
 *
 * How it works:
 * 1. Every 10 minutes, the script looks inside the wallpaper folder.
 * 2. It compares all image filenames with the ones listed in wallpaper.txt.
 * 3. If it finds a new image that’s not listed yet, it assumes that’s a new wallpaper.
 * 4. It immediately sets that image as your GNOME wallpaper using `gsettings`.
 * 5. It appends the filename to wallpaper.txt so it knows it’s already handled.
 * 6. Then it sleeps for 10 minutes and repeats forever.
 *
 * The idea is simple: you just drop a new image into your Dropbox wallpaper folder,
 * and this script will notice it, set it as wallpaper, and mark it as done.
 *
 * It’s designed to run in the background forever — for example,
 * you can start it automatically on system boot with:
 *  $ node app.js
 *
 * Author: Martins Zeltins
 * Environment: Linux (GNOME)
 * Language: Modern JavaScript (ESM)
 */

import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const runCommand = promisify(exec)

// Path configuration
const wallpaperDirectory = '/home/martins/Dropbox/Photos/wallpaper'
const wallpaperListFile = `${wallpaperDirectory}/wallpaper.txt`

// How often to check (in milliseconds)
const checkInterval = 10 * 60 * 1000 // 10 minutes

// Function to get all image files in directory
const getAllImages = async () => {
    const files = await fs.readdir(wallpaperDirectory)
    return files.filter(file => file.match(/\.(png|jpg|jpeg|bmp|webp)$/i))
}

// Function to read the wallpaper list file
const getHandledWallpapers = async () => {
    try {
        const content = await fs.readFile(wallpaperListFile, 'utf-8')
        return content.split('\n').map(line => line.trim()).filter(Boolean)
    } catch (error) {
        if (error.code === 'ENOENT') return [] // file doesn't exist yet
        throw error
    }
}

// Function to set wallpaper in GNOME
const setWallpaper = async (imagePath) => {
    const uri = `file://${imagePath}`
    console.log(`🖼️  Setting wallpaper: ${imagePath}`)
    await runCommand(`gsettings set org.gnome.desktop.background picture-uri '${uri}'`)
    await runCommand(`gsettings set org.gnome.desktop.background picture-uri-dark '${uri}'`)
}

// Function to append handled wallpaper name
const appendHandledWallpaper = async (filename) => {
    await fs.appendFile(wallpaperListFile, `${filename}\n`)
}

// Main watcher loop
const checkForNewWallpapers = async () => {
    const allImages = await getAllImages()
    const handled = await getHandledWallpapers()

    const newImages = allImages.filter(file => !handled.includes(file))

    if (newImages.length > 0) {
        // Handle the newest one (or all, but we'll take first)
        const newWallpaper = newImages[newImages.length - 1]
        const fullPath = `${wallpaperDirectory}/${newWallpaper}`

        await setWallpaper(fullPath)
        await appendHandledWallpaper(newWallpaper)

        console.log(`✅ Wallpaper updated and recorded: ${newWallpaper}`)
    } else {
        console.log(`No new wallpapers found at ${new Date().toLocaleTimeString()}`)
    }
}

// Infinite loop
const startWatching = async () => {
    console.log('📸 Wallpaper watcher started.')
    while (true) {
        try {
            await checkForNewWallpapers()
        } catch (error) {
            console.error('❌ Error during check:', error)
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval))
    }
}

startWatching()

