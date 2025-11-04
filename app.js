/**
 * Wallpaper Sync Script
 * 
 * This Node.js script automatically syncs wallpapers across devices via Dropbox.
 * When you set a wallpaper on any device, it gets copied to Dropbox and applied
 * on all other devices automatically.
 *
 * Folder structure:
 *   /home/martins/Dropbox/Photos/wallpaper/
 *     ├── nov-16-moonlight-bats-nocal-1920x1200.png
 *     ├── some-other-wallpaper.jpg
 *     └── wallpaper.txt   ← list of all wallpapers that have already been synced
 *
 * How it works:
 * 1. Every 10 minutes, the script checks what your current GNOME wallpaper is.
 * 2. If the current wallpaper isn't in the Dropbox folder or wallpaper.txt, 
 *    it copies the wallpaper to Dropbox and adds it to the list.
 * 3. It also checks for new wallpapers in Dropbox that aren't in wallpaper.txt.
 * 4. If found, it sets that wallpaper locally and marks it as handled.
 * 5. This creates a sync loop: set wallpaper on one device → copies to Dropbox 
 *    → other devices detect and apply it automatically.
 *
 * The workflow: Just set any image as wallpaper on any device, and within 10 minutes
 * all your other devices will have the same wallpaper automatically.
 *
 * Run in background forever with: node app.js
 *
 * Author: Martins Zeltins
 * Environment: Linux (GNOME)
 * Language: Modern JavaScript (ESM)
 */

import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'

const runCommand = promisify(exec)

// Logging configuration
const appDataDir = path.join(os.homedir(), '.local', 'state', 'wallpaper-sync')
const logFile = path.join(appDataDir, 'debug.log')
const maxLogLines = 1000

// Path configuration
const wallpaperDirectory = '/home/martins/Dropbox/Photos/wallpaper'
const wallpaperListFile = `${wallpaperDirectory}/wallpaper.txt`
const stateFile = path.join(appDataDir, 'last-script-wallpaper.txt')

// How often to check (in milliseconds)
const checkInterval = 10 * 60 * 1000 // 10 minutes

// Logging functions
const ensureAppDataDirectory = async () => {
    try {
        await fs.mkdir(appDataDir, { recursive: true })
    } catch (error) {
        // Fallback to console if we can't create app data directory
        console.error('Failed to create app data directory:', error)
    }
}

const rotateLogFile = async (content) => {
    const lines = content.split('\n').filter(Boolean)
    if (lines.length > maxLogLines) {
        const keptLines = lines.slice(-(maxLogLines - 1)) // Keep last 999 lines
        return keptLines.join('\n') + '\n'
    }
    return content
}

const log = async (message) => {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`
    
    try {
        await ensureAppDataDirectory()
        
        // Read existing log content
        let existingContent = ''
        try {
            existingContent = await fs.readFile(logFile, 'utf-8')
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error reading log file:', error)
            }
        }
        
        // Rotate log if needed and append new message
        const rotatedContent = await rotateLogFile(existingContent)
        const newContent = rotatedContent + logMessage
        
        console.log(logMessage)
        await fs.writeFile(logFile, newContent)
    } catch (error) {
        // Fallback to console if logging fails
        console.error('Logging failed, falling back to console:', error)
        await log(message)
    }
}

// Function to get the current GNOME wallpaper path
const getCurrentWallpaper = async () => {
    try {
        const { stdout } = await runCommand("gsettings get org.gnome.desktop.background picture-uri")
        // Remove quotes and file:// prefix from the URI
        return stdout.trim().replace(/^'|'$/g, '').replace(/^file:\/\//, '')
    } catch (error) {
        await log(`[error] Failed to get current wallpaper: ${error.message}`)
        return null
    }
}

// Function to get all image files in Dropbox wallpaper directory
const getDropboxImages = async () => {
    try {
        await fs.mkdir(wallpaperDirectory, { recursive: true })
        const files = await fs.readdir(wallpaperDirectory)
        return files.filter(file => file.match(/\.(png|jpg|jpeg|bmp|webp)$/i))
    } catch (error) {
        await log(`[error] Failed to read Dropbox wallpaper directory: ${error.message}`)
        return []
    }
}

// Function to read the handled wallpapers list
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
    await log(`Setting wallpaper: ${imagePath}`)
    await runCommand(`gsettings set org.gnome.desktop.background picture-uri '${uri}'`)
    await runCommand(`gsettings set org.gnome.desktop.background picture-uri-dark '${uri}'`)
    
    // Track that this wallpaper was set by the script
    await saveLastScriptWallpaper(imagePath)
}

// Function to append handled wallpaper to the list
const markWallpaperAsHandled = async (filename) => {
    await fs.appendFile(wallpaperListFile, `${filename}\n`)
    await log(`Marked as handled: ${filename}`)
}

// Function to get the last wallpaper set by the script
const getLastScriptWallpaper = async () => {
    try {
        const content = await fs.readFile(stateFile, 'utf-8')
        return content.trim()
    } catch (error) {
        if (error.code === 'ENOENT') return null // file doesn't exist yet
        await log(`[error] Failed to read state file: ${error.message}`)
        return null
    }
}

// Function to save the last wallpaper set by the script
const saveLastScriptWallpaper = async (wallpaperPath) => {
    try {
        await ensureAppDataDirectory()
        await fs.writeFile(stateFile, wallpaperPath)
        await log(`Saved script wallpaper state: ${path.basename(wallpaperPath)}`)
    } catch (error) {
        await log(`[error] Failed to save state file: ${error.message}`)
    }
}

// Function to check if current wallpaper was changed by user (not script)
const isWallpaperChangedByUser = async (currentWallpaper) => {
    const lastScriptWallpaper = await getLastScriptWallpaper()
    
    // If we have no record of script-set wallpaper, assume it's a user change
    if (!lastScriptWallpaper) {
        return true
    }
    
    // If current wallpaper is different from what script last set, it's a user change
    return currentWallpaper !== lastScriptWallpaper
}

// Function to copy current wallpaper to Dropbox directory
const copyWallpaperToDropbox = async (sourcePath) => {
    try {
        const sourceExtension = path.extname(sourcePath)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const newFilename = `wallpaper-${timestamp}${sourceExtension}`
        const destinationPath = path.join(wallpaperDirectory, newFilename)
        
        // Ensure Dropbox directory exists
        await fs.mkdir(wallpaperDirectory, { recursive: true })
        
        // Copy the file
        await fs.copyFile(sourcePath, destinationPath)
        await log(`Copied wallpaper to Dropbox: ${newFilename}`)
        
        return newFilename
    } catch (error) {
        console.error('Failed to copy wallpaper to Dropbox:', error)
        return null
    }
}

// Function to check if wallpaper file exists in Dropbox directory
const isWallpaperInDropbox = async (wallpaperPath) => {
    const dropboxImages = await getDropboxImages()
    const wallpaperFilename = path.basename(wallpaperPath)
    
    // Check if exact filename exists
    if (dropboxImages.includes(wallpaperFilename)) {
        return wallpaperFilename
    }
    
    // Check if the actual file path points to Dropbox directory
    if (wallpaperPath.startsWith(wallpaperDirectory)) {
        return path.basename(wallpaperPath)
    }
    
    return null
}

// Main sync logic - handles both directions of sync
const performWallpaperSync = async () => {
    const currentWallpaper = await getCurrentWallpaper()
    const handledWallpapers = await getHandledWallpapers()
    
    if (!currentWallpaper) {
        await log('[error] Could not detect current wallpaper')
        return
    }

    // Check if current wallpaper needs to be synced to Dropbox
    await syncCurrentWallpaperToDropbox(currentWallpaper, handledWallpapers)
    
    // Check for new wallpapers from Dropbox to apply locally
    await syncDropboxWallpapersToLocal(handledWallpapers)
}

// Sync current wallpaper to Dropbox if it's new AND was changed by user
const syncCurrentWallpaperToDropbox = async (currentWallpaper, handledWallpapers) => {
    const dropboxFilename = await isWallpaperInDropbox(currentWallpaper)
    
    if (dropboxFilename) {
        // Wallpaper is already in Dropbox, check if it's marked as handled
        if (!handledWallpapers.includes(dropboxFilename)) {
            await markWallpaperAsHandled(dropboxFilename)
            await log(`Current wallpaper marked as handled: ${dropboxFilename}`)
        }
    } else {
        // Only sync to Dropbox if this wallpaper was changed by the user (not the script)
        const isUserChange = await isWallpaperChangedByUser(currentWallpaper)
        
        if (isUserChange) {
            // Wallpaper is not in Dropbox and was changed by user, copy it there
            const newFilename = await copyWallpaperToDropbox(currentWallpaper)
            if (newFilename) {
                await markWallpaperAsHandled(newFilename)
                await log(`User-changed wallpaper synced to Dropbox: ${newFilename}`)
                
                // Update our state to reflect that this wallpaper is now "known" to the script
                await saveLastScriptWallpaper(currentWallpaper)
            }
        } else {
            await log(`Skipping sync - wallpaper was set by script, not user: ${path.basename(currentWallpaper)}`)
        }
    }
}

// Check for new wallpapers in Dropbox and apply them locally
const syncDropboxWallpapersToLocal = async (handledWallpapers) => {
    const dropboxImages = await getDropboxImages()
    const newImages = dropboxImages.filter(filename => !handledWallpapers.includes(filename))
    
    if (newImages.length > 0) {
        // Apply the most recent new wallpaper
        const newestWallpaper = newImages[newImages.length - 1]
        const wallpaperPath = path.join(wallpaperDirectory, newestWallpaper)
        
        await setWallpaper(wallpaperPath)
        await markWallpaperAsHandled(newestWallpaper)
        
        await log(`Applied new wallpaper from Dropbox: ${newestWallpaper}`)
        
        // Mark any other new wallpapers as handled too (to avoid conflicts)
        for (const image of newImages.slice(0, -1)) {
            await markWallpaperAsHandled(image)
        }
    }
}

// Main infinite loop
const startWallpaperSync = async () => {
    await log('Wallpaper sync started - monitoring for changes every 10 minutes')
    await log(`Log file: ${logFile}`)
    await log(`Dropbox wallpaper directory: ${wallpaperDirectory}`)
    await log(`State file: ${stateFile}`)
    
    // Initialize state file with current wallpaper on first run
    const currentWallpaper = await getCurrentWallpaper()
    const lastScriptWallpaper = await getLastScriptWallpaper()
    
    if (!lastScriptWallpaper && currentWallpaper) {
        await log(`Initializing state with current wallpaper: ${path.basename(currentWallpaper)}`)
        await saveLastScriptWallpaper(currentWallpaper)
    }
    
    while (true) {
        try {
            await log(`Checking for wallpaper changes... ${new Date().toLocaleTimeString()}`)
            await performWallpaperSync()
        } catch (error) {
            console.error('Error during sync:', error)
        }
        
        await log(`Sleeping for 10 minutes...`)
        await new Promise(resolve => setTimeout(resolve, checkInterval))
    }
}

startWallpaperSync()

